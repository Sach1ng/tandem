import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, powerMonitor, screen, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { loadConfig, type ClippyConfig } from "./config.ts";
import { parseTasksMarkdown, type ParsedTasks, type SectionKey } from "./parser.ts";
import { moveTaskInFile, toggleDoneInFile } from "./task-file.ts";
import { ask, askAboutScreenshot, capture, groom } from "./agent.ts";
import { ensureKnowledgeBase } from "./knowledge-base.ts";

const APP_DIR = resolve(__dirname, ".."); // apps/clippy
const REPO_ROOT = resolve(APP_DIR, "..", ".."); // repo root (AGENTS.md + PM OS submodule)

let cfg: ClippyConfig;
let win: BrowserWindow;
let expanded = false;
let lastNudgeAt = 0;
let nudgeTimer: ReturnType<typeof setInterval> | null = null;

interface WindowState {
  x?: number;
  y?: number;
  expanded: boolean;
  panelW: number;
  panelH: number;
}

function statePath(): string {
  // userData is always writable; the app dir is read-only once packaged.
  return join(app.getPath("userData"), "window-state.json");
}

function normalizeState(raw: Partial<WindowState>): WindowState {
  const panelW = Number(raw.panelW);
  const panelH = Number(raw.panelH);
  return {
    x: raw.x,
    y: raw.y,
    expanded: Boolean(raw.expanded),
    panelW: Number.isFinite(panelW) && panelW >= cfg.panel.minW ? panelW : cfg.panel.defaultW,
    panelH: Number.isFinite(panelH) && panelH >= cfg.panel.minH ? panelH : cfg.panel.defaultH,
  };
}

function loadState(): WindowState {
  try {
    return normalizeState({ expanded: false, ...JSON.parse(readFileSync(statePath(), "utf8")) });
  } catch {
    return normalizeState({ expanded: false });
  }
}

let state: WindowState;
let skipMovedSave = 0;

function saveState(): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("saveState failed:", err);
  }
}

function readTasks(): ParsedTasks {
  try {
    return parseTasksMarkdown(readFileSync(cfg.tasksFile, "utf8"));
  } catch {
    return {
      tasks: [],
      bySection: { active: [], scheduled: [], waiting: [], needs_triage: [] },
      openCount: 0,
      sectionCounts: { active: 0, scheduled: 0, waiting: 0, needs_triage: 0 },
      parsedAt: Date.now(),
    };
  }
}

function broadcast(): void {
  if (!win?.isDestroyed()) win.webContents.send("tasks:updated", readTasks());
}

function moveWindow(x: number, y: number, persist = false): void {
  if (!win || win.isDestroyed()) return;
  skipMovedSave++;
  win.setPosition(Math.round(x), Math.round(y));
  if (persist) {
    state.x = Math.round(x);
    state.y = Math.round(y);
    saveState();
  }
}

/** Pin a screen corner when the user hasn't dragged Pip elsewhere. */
function anchorWindow(): void {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  const margin = cfg.placement?.margin ?? 16;
  const corner = cfg.placement?.corner ?? "top-right";
  const x = Math.round(work.x + work.width - bounds.width - margin);
  const y =
    corner === "bottom-right"
      ? Math.round(work.y + work.height - bounds.height - margin)
      : Math.round(work.y + margin);
  moveWindow(x, y);
}

function hasUserPlacement(): boolean {
  return Number.isFinite(state.x) && Number.isFinite(state.y);
}

function applyPlacement(): void {
  if (!win || win.isDestroyed()) return;
  if (hasUserPlacement()) {
    moveWindow(state.x!, state.y!);
    return;
  }
  anchorWindow();
}

function clampPanel(w: number, h: number): { w: number; h: number } {
  const area = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  return {
    w: Math.max(cfg.panel.minW, Math.min(w, cfg.panel.maxW, area.width)),
    h: Math.max(cfg.panel.minH, Math.min(h, cfg.panel.maxH, area.height)),
  };
}

function setExpanded(v: boolean): void {
  expanded = v;
  state.expanded = v;
  if (v) {
    const w = state.panelW || cfg.panel.defaultW;
    const h = state.panelH || cfg.panel.compactH || cfg.panel.defaultH;
    win.setResizable(false);
    win.setMinimumSize(cfg.panel.minW, cfg.panel.minH);
    win.setMaximumSize(cfg.panel.maxW, cfg.panel.maxH);
    win.setSize(w, h, false);
    win.setBackgroundColor("#00000000");
    win.webContents.send("widget:expanded", true);
    win.show();
    win.focus();
  } else {
    win.setResizable(false);
    win.setMinimumSize(cfg.collapsed.w, cfg.collapsed.h);
    win.setMaximumSize(cfg.collapsed.w, cfg.collapsed.h);
    win.setSize(cfg.collapsed.w, cfg.collapsed.h, false);
    win.setBackgroundColor("#00000000");
    win.webContents.send("widget:expanded", false);
    win.show();
  }
  applyPlacement();
  saveState();
}

function screenshotPreviewUrl(path: string): string {
  return pathToFileURL(path).href;
}

function snipPayload(path: string | null, status: string, extra: Record<string, unknown> = {}) {
  return path
    ? { path, previewUrl: screenshotPreviewUrl(path), status, ...extra }
    : { status, ...extra };
}

function restoreWindowAfterSnip(priorVisible: boolean, priorExpanded: boolean): void {
  if (!win || win.isDestroyed()) return;
  if (!priorVisible) {
    win.hide();
    return;
  }
  setExpanded(priorExpanded);
}

/** Native macOS region snip — hides Clippy so it isn't in the shot. */
function captureRegion(): Promise<string | null> {
  const dir = join(cfg.workspace, ".tandem", "screenshots");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `shot-${Date.now()}.png`);
  win.hide();
  return new Promise((resolve) => {
    setTimeout(() => {
      execFile("screencapture", ["-i", "-x", file], () => {
        const captured = existsSync(file) ? file : null;
        // Always bring Clippy back — otherwise a cancel/escape leaves the app invisible ("dead").
        if (win && !win.isDestroyed()) win.show();
        resolve(captured);
      });
    }, 180);
  });
}

function paintDelay(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Global hotkey path: expand → capture → preview + processing → answer. */
async function runHotkeySnip(): Promise<void> {
  const priorExpanded = expanded;
  const priorVisible = win.isVisible();

  try {
    setExpanded(true);
    win.webContents.send("widget:snip-result", snipPayload(null, "selecting"));
    await paintDelay();

    const path = await captureRegion();
    if (!path) {
      win.webContents.send("widget:snip-result", snipPayload(null, "cancelled"));
      restoreWindowAfterSnip(priorVisible, priorExpanded);
      return;
    }

    setExpanded(true);
    win.webContents.send("widget:snip-result", snipPayload(path, "captured"));

    if (!cfg.hotkey.autoAsk) {
      win.webContents.send("widget:snip-ready", { path, previewUrl: screenshotPreviewUrl(path) });
      return;
    }

    win.webContents.send("widget:snip-result", snipPayload(path, "loading"));
    try {
      const { text } = await askAboutScreenshot(cfg, path, cfg.hotkey.question);
      win.webContents.send("widget:snip-result", snipPayload(path, "done", { text }));
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      win.webContents.send("widget:snip-result", snipPayload(path, "error", { text: msg }));
    }
  } catch (err) {
    console.error("[hotkey] snip failed:", err);
    const msg = String((err as Error)?.message ?? err);
    win.webContents.send("widget:snip-result", snipPayload(null, "error", { text: msg }));
    restoreWindowAfterSnip(priorVisible, priorExpanded);
  } finally {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }
}

function pingActivity(): void {
  lastNudgeAt = Date.now(); // reset nudge cooldown on any interaction
  if (win && !win.isDestroyed()) win.webContents.send("widget:nudge-clear");
}

function startNudgeWatcher(): void {
  if (nudgeTimer) clearInterval(nudgeTimer);
  if (!cfg.nudge.enabled) return;

  nudgeTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const idle = powerMonitor.getSystemIdleTime();
    const sinceNudge = (Date.now() - lastNudgeAt) / 1000;
    if (idle >= cfg.nudge.idleSeconds && sinceNudge >= cfg.nudge.cooldownSeconds) {
      lastNudgeAt = Date.now();
      win.webContents.send("widget:nudge", {
        idleSeconds: idle,
        message:
          "Hey — you've been quiet a while. Stuck on something? Snip your screen (⌘⇧T) or ask me here.",
      });
    }
  }, 20_000);
}

function registerHotkey(): void {
  const accel = cfg.hotkey.snip?.trim();
  globalShortcut.unregisterAll();

  if (accel) {
    const ok = globalShortcut.register(accel, () => {
      pingActivity();
      void runHotkeySnip().catch((err) => console.error("[hotkey] snip failed:", err));
    });
    if (ok) console.log(`Hotkey registered: ${accel} → snip & ask Pip`);
    else console.warn(`⚠ Could not register hotkey ${accel}`);
  }
}

function showContextMenu(): void {
  const menu = Menu.buildFromTemplate([
    { label: "Snip screen", click: () => void runHotkeySnip() },
    { label: "Open tasks.md", click: () => shell.openPath(cfg.tasksFile) },
    { type: "separator" },
    { label: expanded ? "Minimize" : "Open", click: () => setExpanded(!expanded) },
    { label: "Quit Pip", click: () => app.quit() },
  ]);
  menu.popup({ window: win });
}

function registerIpc(): void {
  ipcMain.handle("tasks:get", () => readTasks());
  ipcMain.handle("tasks:refresh", () => { broadcast(); return readTasks(); });
  ipcMain.handle("tasks:toggle", (_e, id: string) => { toggleDoneInFile(cfg.tasksFile, id); broadcast(); });
  ipcMain.handle("tasks:move", (_e, p: { id: string; toSection: SectionKey }) => { moveTaskInFile(cfg.tasksFile, p.id, p.toSection); broadcast(); });

  ipcMain.handle("config:get", () => ({
    panel: cfg.panel,
    collapsed: cfg.collapsed,
    tasksFile: cfg.tasksFile,
    workspace: cfg.workspace,
    agentWorkspace: cfg.agentWorkspace,
    knowledgeBase: cfg.knowledgeBase,
    hotkey: cfg.hotkey,
    placement: cfg.placement,
    nudge: cfg.nudge,
    voice: cfg.voice,
  }));

  ipcMain.handle("widget:toggle", () => {
    pingActivity();
    setExpanded(!expanded);
    return expanded;
  });
  ipcMain.handle("widget:expand", (_e, v: boolean) => {
    pingActivity();
    setExpanded(v);
    return expanded;
  });
  ipcMain.handle("widget:context-menu", () => { pingActivity(); showContextMenu(); });
  ipcMain.handle("widget:activity", () => { pingActivity(); });

  ipcMain.handle("agent:groom", async () => groom(cfg));
  ipcMain.handle("agent:capture", async (_e, p: { text: string }) => { await capture(cfg, p.text); broadcast(); });
  ipcMain.handle("agent:ask", async (_e, p: { text: string }) => {
    try {
      return await ask(cfg, p.text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { text: msg };
    }
  });

  ipcMain.handle("screenshot:capture", async () => {
    const priorExpanded = expanded;
    const priorVisible = win.isVisible();
    await paintDelay(60);
    const path = await captureRegion();
    if (!path) {
      win.webContents.send("widget:snip-result", snipPayload(null, "cancelled"));
      restoreWindowAfterSnip(priorVisible, priorExpanded);
      return null;
    }
    setExpanded(true);
    return path;
  });
  ipcMain.handle("screenshot:preview-url", (_e, path: string) => screenshotPreviewUrl(path));
  ipcMain.handle("agent:ask-screenshot", async (_e, p: { path: string; question: string }) => {
    if (!p.path || !existsSync(p.path)) {
      return { text: "Screenshot file not found. Try snipping again." };
    }
    try {
      return await askAboutScreenshot(cfg, p.path, p.question);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { text: msg };
    }
  });

  ipcMain.handle("shell:open-tasks", () => shell.openPath(cfg.tasksFile));

  ipcMain.handle("window:drag-by", (_e, p: { dx: number; dy: number }) => {
    const [x = 0, y = 0] = win.getPosition();
    moveWindow(x + p.dx, y + p.dy, true);
  });
  ipcMain.handle("window:resize-by", (_e, p: { dw: number; dh: number }) => {
    const { w, h } = clampPanel(state.panelW + p.dw, state.panelH + p.dh);
    state.panelW = w; state.panelH = h;
    win.setSize(w, h, false);
    saveState();
  });
  ipcMain.handle("window:set-panel-size", (_e, p: { w: number; h: number }) => {
    if (!expanded) return;
    const { w, h } = clampPanel(p.w, p.h);
    state.panelW = w;
    state.panelH = h;
    win.setMinimumSize(w, h);
    win.setMaximumSize(w, h);
    win.setSize(w, h, false);
    applyPlacement();
    saveState();
  });
  ipcMain.handle("window:get-bounds", () => win.getBounds());
}

function createWindow(): void {
  state = loadState();
  // Always start collapsed — avoids window/UI size mismatch showing desktop bleed-through.
  state.expanded = false;

  win = new BrowserWindow({
    width: cfg.collapsed.w,
    height: cfg.collapsed.h,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    acceptFirstMouse: true,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  win.on("moved", () => {
    if (skipMovedSave > 0) {
      skipMovedSave--;
      return;
    }
    const [x, y] = win.getPosition();
    state.x = x;
    state.y = y;
    saveState();
  });

  win.loadFile(join(APP_DIR, "ui", "index.html"));

  win.webContents.once("did-finish-load", () => {
    setExpanded(false);
    applyPlacement();
  });

  screen.on("display-metrics-changed", () => {
    if (!hasUserPlacement()) applyPlacement();
  });

  const watcher = chokidar.watch(cfg.tasksFile, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });
  watcher.on("all", () => broadcast());
  win.on("closed", () => watcher.close());
}

app.whenReady().then(async () => {
  const loaded = loadConfig(APP_DIR, REPO_ROOT);

  try {
    const kb = await ensureKnowledgeBase(loaded.workspace, loaded.knowledgeBase || undefined, async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        type: "question",
        title: "Choose knowledge base",
        message: "PM OS was not found in your workspace.",
        detail:
          "Select the folder that contains your PM OS brain (a skills/ directory — e.g. external/pm-operating-os after tandem init, or a PM-operating-OS clone).",
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "Use this folder",
      });
      return canceled || !filePaths[0] ? null : filePaths[0];
    });

    cfg = {
      ...loaded,
      knowledgeBase: kb.knowledgeBase,
      agentWorkspace: kb.agentWorkspace,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox("Pip — knowledge base required", msg);
    app.quit();
    return;
  }

  console.log(`Clippy workspace: ${cfg.workspace}`);
  console.log(`Clippy knowledge base: ${cfg.knowledgeBase}`);
  console.log(`Clippy agent workspace: ${cfg.agentWorkspace}`);
  console.log(`Clippy tasksFile: ${cfg.tasksFile}`);

  registerIpc();
  createWindow();
  registerHotkey();
  startNudgeWatcher();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (nudgeTimer) clearInterval(nudgeTimer);
});

app.on("window-all-closed", () => app.quit());
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
