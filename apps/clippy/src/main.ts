import { app, BrowserWindow, ipcMain, Menu, screen, shell } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chokidar from "chokidar";
import { loadConfig, type ClippyConfig } from "./config.ts";
import { parseTasksMarkdown, type ParsedTasks, type SectionKey } from "./parser.ts";
import { moveTaskInFile, toggleDoneInFile } from "./task-file.ts";
import { capture, groom } from "./agent.ts";

const APP_DIR = resolve(__dirname, ".."); // apps/clippy
const REPO_ROOT = resolve(APP_DIR, "..", ".."); // repo root (AGENTS.md + PM OS submodule)

let cfg: ClippyConfig;
let win: BrowserWindow;
let expanded = false;

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

function loadState(): WindowState {
  try {
    return { expanded: false, ...JSON.parse(readFileSync(statePath(), "utf8")) };
  } catch {
    return { expanded: false, panelW: cfg.panel.defaultW, panelH: cfg.panel.defaultH };
  }
}

let state: WindowState;
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
    const { w, h } = clampPanel(state.panelW, state.panelH);
    state.panelW = w;
    state.panelH = h;
    win.setResizable(true);
    win.setMinimumSize(cfg.panel.minW, cfg.panel.minH);
    win.setMaximumSize(cfg.panel.maxW, cfg.panel.maxH);
    win.setSize(w, h, false);
    win.show();
    win.focus();
  } else {
    win.setResizable(false);
    win.setMinimumSize(cfg.collapsed.w, cfg.collapsed.h);
    win.setMaximumSize(cfg.collapsed.w, cfg.collapsed.h);
    win.setSize(cfg.collapsed.w, cfg.collapsed.h, false);
  }
  win.webContents.send("widget:expanded", v);
  saveState();
}

function showContextMenu(): void {
  const t = readTasks();
  const menu = Menu.buildFromTemplate([
    { label: `Open tasks (${t.openCount})`, click: () => setExpanded(true) },
    { label: `Triage (${t.sectionCounts.needs_triage})`, click: () => { setExpanded(true); win.webContents.send("widget:show-triage"); } },
    { type: "separator" },
    { label: expanded ? "Collapse" : "Expand", click: () => setExpanded(!expanded) },
    { label: "Refresh", click: () => broadcast() },
    { label: "Open tasks.md", click: () => shell.openPath(cfg.tasksFile) },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  menu.popup({ window: win });
}

function registerIpc(): void {
  ipcMain.handle("tasks:get", () => readTasks());
  ipcMain.handle("tasks:refresh", () => { broadcast(); return readTasks(); });
  ipcMain.handle("tasks:toggle", (_e, id: string) => { toggleDoneInFile(cfg.tasksFile, id); broadcast(); });
  ipcMain.handle("tasks:move", (_e, p: { id: string; toSection: SectionKey }) => { moveTaskInFile(cfg.tasksFile, p.id, p.toSection); broadcast(); });

  ipcMain.handle("config:get", () => ({ panel: cfg.panel, collapsed: cfg.collapsed, tasksFile: cfg.tasksFile, workspace: cfg.workspace }));

  ipcMain.handle("widget:toggle", () => setExpanded(!expanded));
  ipcMain.handle("widget:expand", (_e, v: boolean) => setExpanded(v));
  ipcMain.handle("widget:context-menu", () => showContextMenu());

  ipcMain.handle("agent:groom", async () => groom(cfg));
  ipcMain.handle("agent:capture", async (_e, p: { text: string }) => { await capture(cfg, p.text); broadcast(); });

  ipcMain.handle("shell:open-tasks", () => shell.openPath(cfg.tasksFile));

  ipcMain.handle("window:drag-by", (_e, p: { dx: number; dy: number }) => {
    const [x = 0, y = 0] = win.getPosition();
    win.setPosition(Math.round(x + p.dx), Math.round(y + p.dy));
  });
  ipcMain.handle("window:resize-by", (_e, p: { dw: number; dh: number }) => {
    const { w, h } = clampPanel(state.panelW + p.dw, state.panelH + p.dh);
    state.panelW = w; state.panelH = h;
    win.setSize(w, h, false);
    saveState();
  });
  ipcMain.handle("window:set-panel-size", (_e, p: { w: number; h: number }) => {
    const { w, h } = clampPanel(p.w, p.h);
    state.panelW = w; state.panelH = h;
    win.setSize(w, h, false);
    saveState();
  });
  ipcMain.handle("window:get-bounds", () => win.getBounds());
}

function createWindow(): void {
  state = loadState();
  win = new BrowserWindow({
    width: cfg.collapsed.w,
    height: cfg.collapsed.h,
    x: state.x,
    y: state.y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") app.dock?.hide();

  win.on("moved", () => {
    const [x = 0, y = 0] = win.getPosition();
    state.x = x; state.y = y;
    saveState();
  });

  win.loadFile(join(APP_DIR, "ui", "index.html"));

  const watcher = chokidar.watch(cfg.tasksFile, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });
  watcher.on("all", () => broadcast());
  win.on("closed", () => watcher.close());
}

app.whenReady().then(() => {
  cfg = loadConfig(APP_DIR, REPO_ROOT);
  console.log(`Clippy workspace: ${cfg.workspace}`);
  console.log(`Clippy tasksFile: ${cfg.tasksFile}`);
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
