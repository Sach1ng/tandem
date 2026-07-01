import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, powerMonitor, screen, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { loadConfig, type ClippyConfig } from "./config.ts";
import { parseTasksMarkdown, type ParsedTasks, type SectionKey, type Task } from "./parser.ts";
import { moveTaskInFile, toggleDoneInFile } from "./task-file.ts";
import { ask, askAboutScreenshot, askStream, capture, groom } from "./agent.ts";
import { ensureKnowledgeBase } from "./knowledge-base.ts";
import { makeScreenshotPreview, type CapturedScreenshot } from "./screenshot.ts";
import { RequestLog, type RequestSource } from "./request-log.ts";
import { startMonitorServer } from "./monitor-server.ts";
import { loadPipChatId, savePipChatId, warmAgentSession } from "./agent-session.ts";

const APP_DIR = resolve(__dirname, ".."); // apps/clippy
const REPO_ROOT = resolve(APP_DIR, "..", ".."); // repo root (AGENTS.md + PM OS submodule)

let cfg: ClippyConfig;
let win: BrowserWindow;
let expanded = false;
let expandAnimating = false;
let lastNudgeAt = 0;
let nudgeTimer: ReturnType<typeof setInterval> | null = null;
let tuckedForCapture: { x: number; y: number; wasVisible: boolean } | null = null;
let requestLog: RequestLog;
let monitorPort = 8791;
let pipChatId: string | null = null;

interface WindowState {
  corner?: Corner;
  anchorX?: number;
  anchorY?: number;
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
    corner: raw.corner,
    anchorX: raw.anchorX,
    anchorY: raw.anchorY,
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

// Lens-assigned tasks we've already surfaced, so a re-parse doesn't re-pop the orb.
const seenLensTasks = new Set<string>();

/** Stable-ish key for a Lens task across line shifts (title + source + outcome head). */
function lensTaskKey(t: Task): string {
  return `${t.title}|${t.meta.source ?? ""}|${(t.meta.outcome ?? "").slice(0, 40)}`;
}

/**
 * Find tasks assigned from Lens that have completed (have an Outcome) and surface any new ones in
 * the orb. On the initial pass we only record existing keys so old tasks don't pop on launch.
 */
async function detectLensTasks(initial = false): Promise<void> {
  if (!win || win.isDestroyed()) return;
  const parsed = readTasks();
  const all = [
    ...parsed.bySection.active,
    ...parsed.bySection.scheduled,
    ...parsed.bySection.waiting,
    ...parsed.bySection.needs_triage,
  ];

  for (const t of all) {
    if (t.done) continue;
    // Web-assigned tasks are tagged `from/web` (legacy: `from/lens`).
    if (!t.tags.includes("from/web") && !t.tags.includes("from/lens")) continue;
    if (!t.meta.outcome) continue; // wait until the agent's outcome is written
    const key = lensTaskKey(t);
    if (seenLensTasks.has(key)) continue;
    seenLensTasks.add(key);
    if (initial) continue;

    const project = t.tags.find((tag) => tag.startsWith("project/"))?.slice("project/".length) ?? null;
    const payload = {
      id: t.id,
      title: t.title,
      source: t.meta.source ?? null,
      page: t.meta.page ?? null,
      outcome: t.meta.outcome ?? "",
      project,
      priority: t.priority,
    };

    pingActivity();
    win.show();
    await setExpanded(true);
    if (!win.isDestroyed()) win.webContents.send("widget:lens-task", payload);
  }
}

function moveWindow(x: number, y: number): void {
  if (!win || win.isDestroyed()) return;
  skipMovedSave++;
  win.setPosition(Math.round(x), Math.round(y));
}

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function normalizeCorner(c: string | undefined): Corner {
  return c === "top-left" || c === "top-right" || c === "bottom-left" || c === "bottom-right"
    ? c
    : "bottom-right";
}

function workAreaFor(): { x: number; y: number; width: number; height: number } {
  return screen.getDisplayMatching(win.getBounds()).workArea;
}

/**
 * Record which corner Pip is glued to (from its current position) so later resizes grow inward.
 * The anchor is the screen point of that corner — size-independent, so it survives expand/collapse.
 */
function rememberDock(): void {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const work = workAreaFor();
  const right = b.x + b.width / 2 >= work.x + work.width / 2;
  const bottom = b.y + b.height / 2 >= work.y + work.height / 2;
  state.corner = `${bottom ? "bottom" : "top"}-${right ? "right" : "left"}` as Corner;
  state.anchorX = right ? b.x + b.width : b.x;
  state.anchorY = bottom ? b.y + b.height : b.y;
  saveState();
}

/**
 * Position Pip for its CURRENT size, keeping the docked corner fixed so the panel always opens toward
 * screen center, and clamped fully inside the work area (never off-screen, never under the menu bar).
 */
function applyPlacement(): void {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const work = workAreaFor();
  const margin = cfg.placement?.margin ?? 16;
  const corner = normalizeCorner(state.corner ?? cfg.placement?.corner);

  let ax: number;
  let ay: number;
  if (Number.isFinite(state.anchorX) && Number.isFinite(state.anchorY)) {
    ax = state.anchorX!;
    ay = state.anchorY!;
  } else if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
    // Migrate legacy top-left state → corner anchor point.
    ax = corner.endsWith("right") ? state.x! + cfg.collapsed.w : state.x!;
    ay = corner.startsWith("bottom") ? state.y! + cfg.collapsed.h : state.y!;
  } else {
    ax = corner.endsWith("right") ? work.x + work.width - margin : work.x + margin;
    ay = corner.startsWith("bottom") ? work.y + work.height - margin : work.y + margin;
  }

  let x = corner.endsWith("right") ? ax - b.width : ax;
  let y = corner.startsWith("bottom") ? ay - b.height : ay;

  // Clamp so the whole window stays inside the work area.
  const maxX = work.x + work.width - b.width - margin;
  const maxY = work.y + work.height - b.height - margin;
  x = Math.min(Math.max(x, work.x + margin), Math.max(work.x + margin, maxX));
  y = Math.min(Math.max(y, work.y + margin), Math.max(work.y + margin, maxY));

  moveWindow(x, y);
  sendDock();
}

let lastDockEdge: "top" | "bottom" | null = null;

/** Tell the renderer which vertical edge Pip is docked to, so replies stack away from it. */
function sendDock(): void {
  if (!win || win.isDestroyed()) return;
  const corner = normalizeCorner(state.corner ?? cfg.placement?.corner);
  const edge = corner.startsWith("bottom") ? "bottom" : "top";
  if (edge === lastDockEdge) return;
  lastDockEdge = edge;
  win.webContents.send("widget:dock", { edge });
}

function clampPanel(w: number, h: number): { w: number; h: number } {
  const area = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  return {
    w: Math.max(cfg.panel.minW, Math.min(w, cfg.panel.maxW, area.width)),
    h: Math.max(cfg.panel.minH, Math.min(h, cfg.panel.maxH, area.height)),
  };
}

const PIP_TRANSITION_MS = 280;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Smooth window resize for collapsed ↔ expanded transitions. */
async function animateWindowSize(targetW: number, targetH: number, ms = PIP_TRANSITION_MS): Promise<void> {
  if (!win || win.isDestroyed()) return;
  const start = win.getBounds();
  if (start.width === targetW && start.height === targetH) return;

  const minW = Math.min(start.width, targetW);
  const minH = Math.min(start.height, targetH);
  const maxW = Math.max(start.width, targetW);
  const maxH = Math.max(start.height, targetH);
  win.setMinimumSize(minW, minH);
  win.setMaximumSize(maxW, maxH);

  const t0 = Date.now();
  while (true) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const e = easeOutCubic(t);
    const w = Math.round(start.width + (targetW - start.width) * e);
    const h = Math.round(start.height + (targetH - start.height) * e);
    win.setSize(w, h, false);
    applyPlacement();
    if (t >= 1) break;
    await sleep(16);
  }
}

async function setExpanded(v: boolean, opts: { animate?: boolean } = {}): Promise<void> {
  const animate = opts.animate ?? true;
  if (expandAnimating) return;
  if (expanded === v && !animate) return;

  expandAnimating = animate;
  expanded = v;
  state.expanded = v;
  win.setBackgroundColor("#00000000");

  try {
    if (v) {
      const w = state.panelW || cfg.panel.defaultW;
      const h = state.panelH || cfg.panel.compactH || cfg.panel.defaultH;
      win.setResizable(false);
      win.webContents.send("widget:expanded", true);
      win.show();
      if (animate) await animateWindowSize(w, h);
      else win.setSize(w, h, false);
      win.setMinimumSize(cfg.panel.minW, cfg.panel.minH);
      win.setMaximumSize(cfg.panel.maxW, cfg.panel.maxH);
      win.focus();
    } else {
      win.webContents.send("widget:expanded", false);
      const cw = cfg.collapsed.w;
      const ch = cfg.collapsed.h;
      win.setResizable(false);
      if (animate) await animateWindowSize(cw, ch);
      else win.setSize(cw, ch, false);
      win.setMinimumSize(cw, ch);
      win.setMaximumSize(cw, ch);
      win.show();
    }
  } finally {
    expandAnimating = false;
  }

  applyPlacement();
  saveState();
}

function screenshotPreviewUrl(path: string): string {
  return pathToFileURL(path).href;
}

function snipPayload(
  shot: CapturedScreenshot | null,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return shot
    ? {
        path: shot.path,
        previewUrl: screenshotPreviewUrl(shot.previewPath),
        status,
        ...extra,
      }
    : { status, ...extra };
}

function restoreWindowAfterSnip(priorVisible: boolean, priorExpanded: boolean): void {
  if (!win || win.isDestroyed()) return;
  if (!priorVisible) {
    win.hide();
    return;
  }
  setExpanded(priorExpanded, { animate: false });
}

function tuckWindowForCapture(): void {
  if (!win || win.isDestroyed()) return;
  const [x = 0, y = 0] = win.getPosition();
  tuckedForCapture = { x, y, wasVisible: win.isVisible() };
  skipMovedSave += 2;
  // Move off-screen instead of hide() — hide() makes Pip feel like it quit/restarted.
  win.setPosition(-32000, y, false);
}

function untuckWindow(): void {
  if (!win || win.isDestroyed() || !tuckedForCapture) return;
  skipMovedSave += 2;
  win.setPosition(tuckedForCapture.x, tuckedForCapture.y, false);
  if (tuckedForCapture.wasVisible) win.show();
  tuckedForCapture = null;
}

/** Native macOS region snip — tucks Pip off-screen so it isn't in the shot. */
function captureRegion(): Promise<CapturedScreenshot | null> {
  const dir = join(cfg.workspace, ".tandem", "screenshots");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `shot-${Date.now()}.png`);
  tuckWindowForCapture();
  return new Promise((resolve) => {
    setTimeout(() => {
      execFile("screencapture", ["-i", "-x", file], () => {
        untuckWindow();
        if (!existsSync(file)) {
          resolve(null);
          return;
        }
        // Return immediately; thumbnail is for UI only — don't block the snip flow.
        resolve({ path: file, previewPath: file });
        void makeScreenshotPreview(file).catch(() => {});
      });
    }, 80);
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
    await setExpanded(true, { animate: false });
    win.webContents.send("widget:snip-result", snipPayload(null, "selecting"));
    await paintDelay();

    const shot = await captureRegion();
    if (!shot) {
      win.webContents.send("widget:snip-result", snipPayload(null, "cancelled"));
      restoreWindowAfterSnip(priorVisible, priorExpanded);
      return;
    }

    await setExpanded(true, { animate: false });
    win.webContents.send("widget:snip-result", snipPayload(shot, "captured"));

    if (!cfg.hotkey.autoAsk) {
      win.webContents.send("widget:snip-ready", {
        path: shot.path,
        previewUrl: screenshotPreviewUrl(shot.previewPath),
      });
      return;
    }

    win.webContents.send("widget:snip-result", snipPayload(shot, "loading"));
    signalWorking(true, "Analyzing screenshot…");
    try {
      const { text } = await runLoggedScreenshotAsk(
        shot.path,
        cfg.hotkey.question,
        "hotkey",
        shot.previewPath,
      );
      win.webContents.send("widget:snip-result", snipPayload(shot, "done", { text }));
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      win.webContents.send("widget:snip-result", snipPayload(shot, "error", { text: msg }));
    } finally {
      signalWorking(false);
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

function signalWorking(active: boolean, label = "Working…"): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("widget:working", { active, label });
}

function pingActivity(): void {
  lastNudgeAt = Date.now(); // reset nudge cooldown on any interaction
  if (win && !win.isDestroyed()) win.webContents.send("widget:nudge-clear");
}

function openMonitorDashboard(): void {
  void shell.openExternal(`http://127.0.0.1:${monitorPort}`);
}

async function runLoggedAsk(text: string, source: RequestSource): Promise<{ text: string }> {
  const entry = requestLog.start({ kind: "ask", question: text, source });
  try {
    const result = await ask(cfg, text, { resumeChatId: pipChatId });
    rememberChatId(result.chatId);
    requestLog.finish(entry.id, {
      status: "done",
      response: result.text,
      chatId: result.chatId,
      durationMs: result.durationMs,
    });
    return { text: result.text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    requestLog.finish(entry.id, { status: "error", error: msg });
    return { text: msg };
  }
}

/** Streaming ask: pushes text deltas to the renderer as the model generates them. */
async function runLoggedAskStream(text: string, source: RequestSource): Promise<{ text: string }> {
  const entry = requestLog.start({ kind: "ask", question: text, source });
  const send = (channel: string, payload?: unknown) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  send("widget:ask-start");
  try {
    const result = await askStream(cfg, text, (delta) => send("widget:ask-delta", { delta }), {
      resumeChatId: pipChatId,
    });
    rememberChatId(result.chatId);
    requestLog.finish(entry.id, {
      status: "done",
      response: result.text,
      chatId: result.chatId,
      durationMs: result.durationMs,
    });
    send("widget:ask-end", { text: result.text });
    return { text: result.text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    requestLog.finish(entry.id, { status: "error", error: msg });
    send("widget:ask-end", { text: msg, error: true });
    return { text: msg };
  }
}

function rememberChatId(chatId: string | null | undefined): void {
  if (!chatId) return;
  pipChatId = chatId;
  savePipChatId(cfg.workspace, chatId);
}

async function runLoggedScreenshotAsk(
  path: string,
  question: string,
  source: RequestSource,
  previewPath?: string,
): Promise<{ text: string }> {
  const entry = requestLog.start({
    kind: "screenshot",
    question,
    screenshotPath: path,
    previewPath,
    source,
  });
  try {
    const result = await askAboutScreenshot(cfg, path, question, { resumeChatId: pipChatId });
    rememberChatId(result.chatId);
    requestLog.finish(entry.id, {
      status: "done",
      response: result.text,
      chatId: result.chatId,
      durationMs: result.durationMs,
    });
    return { text: result.text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    requestLog.finish(entry.id, { status: "error", error: msg });
    return { text: msg };
  }
}

async function runLoggedCapture(text: string, source: RequestSource): Promise<void> {
  const entry = requestLog.start({ kind: "capture", question: text, source });
  try {
    await capture(cfg, text);
    requestLog.finish(entry.id, { status: "done", response: "Task appended to Needs triage." });
    broadcast();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    requestLog.finish(entry.id, { status: "error", error: msg });
    throw err;
  }
}

async function runLoggedGroom(source: RequestSource = "menu") {
  const entry = requestLog.start({ kind: "groom", question: "Review task board", source });
  try {
    const result = await groom(cfg);
    requestLog.finish(entry.id, { status: "done", response: result.raw.slice(0, 4000) });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    requestLog.finish(entry.id, { status: "error", error: msg });
    throw err;
  }
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

function restartClippy(): void {
  void dialog
    .showMessageBox(win, {
      type: "question",
      buttons: ["Restart", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Restart Pip",
      message: "Restart Pip?",
      detail: "This will briefly quit and reopen the Pip window.",
    })
    .then(({ response }) => {
      if (response !== 0) return;
      app.relaunch();
      app.exit(0);
    });
}

function showContextMenu(): void {
  const menu = Menu.buildFromTemplate([
    { label: "Snip screen", click: () => void runHotkeySnip() },
    { label: "Open tasks.md", click: () => shell.openPath(cfg.tasksFile) },
    { label: "Open monitor", click: () => openMonitorDashboard() },
    { type: "separator" },
    { label: expanded ? "Minimize" : "Open", click: () => void setExpanded(!expanded) },
    { label: "Restart Pip", click: () => restartClippy() },
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
    monitor: cfg.monitor,
  }));

  ipcMain.handle("widget:toggle", async () => {
    pingActivity();
    await setExpanded(!expanded);
    return expanded;
  });
  ipcMain.handle("widget:expand", async (_e, v: boolean) => {
    pingActivity();
    await setExpanded(v);
    return expanded;
  });
  ipcMain.handle("widget:context-menu", () => { pingActivity(); showContextMenu(); });
  ipcMain.handle("widget:activity", () => { pingActivity(); });

  ipcMain.handle("agent:groom", async () => runLoggedGroom("menu"));
  ipcMain.handle("agent:capture", async (_e, p: { text: string }) => {
    await runLoggedCapture(p.text, "ui");
  });
  ipcMain.handle("agent:ask", async (_e, p: { text: string }) => {
    signalWorking(true, "Thinking…");
    try {
      return await runLoggedAskStream(p.text, "ui");
    } finally {
      signalWorking(false);
    }
  });

  ipcMain.handle("screenshot:capture", async () => {
    const priorExpanded = expanded;
    const priorVisible = win.isVisible();
    await paintDelay(60);
    const shot = await captureRegion();
    if (!shot) {
      win.webContents.send("widget:snip-result", snipPayload(null, "cancelled"));
      restoreWindowAfterSnip(priorVisible, priorExpanded);
      return null;
    }
    await setExpanded(true, { animate: false });
    return { path: shot.path, previewUrl: screenshotPreviewUrl(shot.previewPath) };
  });
  ipcMain.handle("screenshot:preview-url", (_e, path: string) => screenshotPreviewUrl(path));
  ipcMain.handle("agent:ask-screenshot", async (_e, p: { path: string; question: string }) => {
    const path = p.path?.trim();
    const question = p.question?.trim() || "What's on my screen? If there's an error, tell me how to fix it.";
    if (!path || !existsSync(path)) {
      return { text: "Screenshot file not found. Try snipping again." };
    }
    signalWorking(true, "Analyzing screenshot…");
    try {
      return await runLoggedScreenshotAsk(path, question, "ui");
    } finally {
      signalWorking(false);
    }
  });

  ipcMain.handle("shell:open-tasks", () => shell.openPath(cfg.tasksFile));

  ipcMain.handle("window:drag-by", (_e, p: { dx: number; dy: number }) => {
    const [x = 0, y = 0] = win.getPosition();
    moveWindow(x + p.dx, y + p.dy);
    rememberDock();
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
    win.setMinimumSize(cfg.panel.minW, cfg.panel.minH);
    win.setMaximumSize(cfg.panel.maxW, cfg.panel.maxH);
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
    rememberDock();
  });

  win.loadFile(join(APP_DIR, "ui", "index.html"));

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[pip] renderer gone:", details.reason, details.exitCode);
    if (details.reason === "clean-exit" || win.isDestroyed()) return;
    win.loadFile(join(APP_DIR, "ui", "index.html"));
  });

  win.webContents.once("did-finish-load", () => {
    void setExpanded(false, { animate: false });
    applyPlacement();
  });

  screen.on("display-metrics-changed", () => {
    applyPlacement();
  });

  const watcher = chokidar.watch(cfg.tasksFile, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });
  watcher.on("all", () => {
    broadcast();
    void detectLensTasks();
  });
  win.on("closed", () => watcher.close());

  // Snapshot existing Lens tasks so only ones assigned from now on pop the orb.
  void detectLensTasks(true);
}

app.whenReady().then(async () => {
  const loaded = loadConfig(APP_DIR, REPO_ROOT);

  try {
    const kb = await ensureKnowledgeBase(loaded.workspace, loaded.knowledgeBase || undefined);
    cfg = {
      ...loaded,
      knowledgeBase: kb.knowledgeBase,
      agentWorkspace: kb.agentWorkspace,
    };
  } catch (err) {
    // ensureKnowledgeBase self-seeds and shouldn't throw; fall back to the workspace as the brain.
    console.error("Brain setup warning:", err instanceof Error ? err.message : String(err));
    cfg = { ...loaded, knowledgeBase: loaded.workspace, agentWorkspace: loaded.workspace };
  }

  console.log(`Pip workspace: ${cfg.workspace}`);
  console.log(`Pip knowledge base: ${cfg.knowledgeBase}`);
  console.log(`Pip agent workspace: ${cfg.agentWorkspace}`);
  console.log(`Pip tasksFile: ${cfg.tasksFile}`);

  requestLog = new RequestLog(cfg.workspace);
  monitorPort = cfg.monitor.port;
  pipChatId = loadPipChatId(cfg.workspace);
  if (cfg.monitor.enabled) {
    startMonitorServer({
      port: monitorPort,
      workspace: cfg.workspace,
      monitorDir: join(APP_DIR, "monitor"),
      log: requestLog,
    });
  }

  // Warm cursor-agent session in background so the first real ask is faster.
  void warmAgentSession(cfg.agent, pipChatId).then((id) => {
    if (id) rememberChatId(id);
  });

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
