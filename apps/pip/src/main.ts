import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, powerMonitor, screen, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { loadConfig, type PipConfig } from "./config.ts";
import { parseTasksMarkdown, type ParsedTasks, type SectionKey, type Task } from "./parser.ts";
import { moveTaskInFile, toggleDoneInFile } from "./task-file.ts";
import { ask, askAboutScreenshot, askStream, capture, groom } from "./agent.ts";
import { ensureKnowledgeBase } from "./knowledge-base.ts";
import { makeScreenshotPreview, type CapturedScreenshot } from "./screenshot.ts";
import { RequestLog, type RequestSource } from "./request-log.ts";
import { startMonitorServer } from "./monitor-server.ts";
import { loadPipChatId, savePipChatId, warmAgentSession } from "./agent-session.ts";
import { logActivity } from "@tandem/core";

const APP_DIR = resolve(__dirname, ".."); // apps/pip
const REPO_ROOT = resolve(APP_DIR, "..", ".."); // repo root (AGENTS.md + PM OS submodule)

let cfg: PipConfig;
let win: BrowserWindow;
let expanded = false;
let expandAnimating = false;
let lastNudgeAt = 0;
let nudgeTimer: ReturnType<typeof setInterval> | null = null;
let tuckedForCapture: { x: number; y: number; wasVisible: boolean } | null = null;
let requestLog: RequestLog;
let monitorPort = 8791;
let pipChatId: string | null = null;
/** Runtime-selected model for text asks (model-agnostic switcher). */
let selectedModel: string | null = null;
/** Dock to glide back to after a summon-to-cursor; null when Pip is at its normal home. */
let preSummonDock: { corner?: Corner; anchorX?: number; anchorY?: number } | null = null;
let gazeTimer: ReturnType<typeof setInterval> | null = null;
let lastGaze = { dx: 0, dy: 0 };
/** Peek-when-idle bookkeeping: the on-screen position to restore to when Pip un-peeks. */
let peekTimer: ReturnType<typeof setInterval> | null = null;
let peeking = false;
let peekHome: { x: number; y: number } | null = null;
/** Manual hide (meeting/screen-share safety). When true, Pip is fully hidden and quiet. */
let hidden = false;
/** Speak replies aloud (macOS `say`). Runtime toggle, seeded from config. */
let voiceOut = false;
/** Handle to the running `say` process so a new reply / user action can interrupt it. */
let sayChild: ReturnType<typeof execFile> | null = null;

interface WindowState {
  corner?: Corner;
  anchorX?: number;
  anchorY?: number;
  x?: number;
  y?: number;
  expanded: boolean;
  panelW: number;
  panelH: number;
  model?: string;
  voiceOut?: boolean;
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
    model: typeof raw.model === "string" ? raw.model : undefined,
    voiceOut: typeof raw.voiceOut === "boolean" ? raw.voiceOut : undefined,
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

// Lens-assigned tasks we've already surfaced, so a re-parse doesn't re-pop Pip.
const seenLensTasks = new Set<string>();

/** Stable-ish key for a Lens task across line shifts (title + source + outcome head). */
function lensTaskKey(t: Task): string {
  return `${t.title}|${t.meta.source ?? ""}|${(t.meta.outcome ?? "").slice(0, 40)}`;
}

/**
 * Find tasks assigned from Lens that have completed (have an Outcome) and surface any new ones in
 * Pip. On the initial pass we only record existing keys so old tasks don't pop on launch.
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
  // A manual move is a new home — don't glide back to a pre-summon dock.
  preSummonDock = null;
  saveState();
}

/**
 * Compute the collapsed window's top-left BEFORE the window exists, so it's created already at its
 * docked corner (no centered-then-jump on launch). Mirrors applyPlacement's anchor math.
 */
function initialCornerPosition(): { x: number; y: number } {
  const margin = cfg.placement?.margin ?? 16;
  const corner = normalizeCorner(state?.corner ?? cfg.placement?.corner);
  const w = cfg.collapsed.w;
  const h = cfg.collapsed.h;
  const pt =
    Number.isFinite(state?.anchorX) && Number.isFinite(state?.anchorY)
      ? { x: state.anchorX!, y: state.anchorY! }
      : null;
  const display = pt ? screen.getDisplayNearestPoint(pt) : screen.getPrimaryDisplay();
  const work = display.workArea;

  let ax: number;
  let ay: number;
  if (pt) {
    ax = pt.x;
    ay = pt.y;
  } else {
    ax = corner.endsWith("right") ? work.x + work.width - margin : work.x + margin;
    ay = corner.startsWith("bottom") ? work.y + work.height - margin : work.y + margin;
  }

  let x = corner.endsWith("right") ? ax - w : ax;
  let y = corner.startsWith("bottom") ? ay - h : ay;
  x = Math.min(Math.max(x, work.x + margin), work.x + work.width - w - margin);
  y = Math.min(Math.max(y, work.y + margin), work.y + work.height - h - margin);
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Top-left position for a window of the given size, keeping the docked corner fixed so the panel opens
 * toward screen center, clamped fully inside the work area. Pure math — no window mutation.
 */
function placementFor(width: number, height: number): { x: number; y: number } {
  const work = workAreaFor();
  const margin = cfg.placement?.margin ?? 16;
  const corner = normalizeCorner(state.corner ?? cfg.placement?.corner);

  let ax: number;
  let ay: number;
  if (Number.isFinite(state.anchorX) && Number.isFinite(state.anchorY)) {
    ax = state.anchorX!;
    ay = state.anchorY!;
  } else if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
    ax = corner.endsWith("right") ? state.x! + cfg.collapsed.w : state.x!;
    ay = corner.startsWith("bottom") ? state.y! + cfg.collapsed.h : state.y!;
  } else {
    ax = corner.endsWith("right") ? work.x + work.width - margin : work.x + margin;
    ay = corner.startsWith("bottom") ? work.y + work.height - margin : work.y + margin;
  }

  let x = corner.endsWith("right") ? ax - width : ax;
  let y = corner.startsWith("bottom") ? ay - height : ay;
  const maxX = work.x + work.width - width - margin;
  const maxY = work.y + work.height - height - margin;
  x = Math.min(Math.max(x, work.x + margin), Math.max(work.x + margin, maxX));
  y = Math.min(Math.max(y, work.y + margin), Math.max(work.y + margin, maxY));
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Position Pip for its CURRENT size, keeping the docked corner fixed. Used for placement-only updates
 * (display change, drag end). Size changes go through resizeWindowTo() to keep geometry atomic.
 */
function applyPlacement(): void {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const p = placementFor(b.width, b.height);
  moveWindow(p.x, p.y);
  sendDock();
}

/**
 * The ONE place window geometry (size + position) changes together, so the corner stays anchored and we
 * make a single atomic native bounds change instead of a per-frame resize loop. Concurrent/looped
 * resizes on a transparent window were crashing the GPU process (the "Pip vanishes / needs multiple
 * clicks" bug); combined with hardware acceleration being off, this keeps geometry changes crash-safe.
 */
function resizeWindowTo(width: number, height: number, animate: boolean): void {
  if (!win || win.isDestroyed()) return;
  const p = placementFor(width, height);
  win.setBounds({ x: p.x, y: p.y, width, height }, animate && process.platform === "darwin");
  sendDock();
}

/** Ease the window to (x, y) over ~180ms — used for magnetic snap so it feels physical, not teleporty. */
async function animateMoveTo(x: number, y: number, ms = 180): Promise<void> {
  if (!win || win.isDestroyed()) return;
  const start = win.getBounds();
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (start.x === tx && start.y === ty) return;
  const t0 = Date.now();
  while (true) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const e = easeOutCubic(t);
    moveWindow(start.x + (tx - start.x) * e, start.y + (ty - start.y) * e);
    if (t >= 1) break;
    await sleep(16);
  }
}

/**
 * Magnetic edge snap: on drop, if Pip is within snapThreshold of a work-area edge, glide it flush to
 * that edge (with margin). Dropped far from every edge, it stays where you put it. Records the new dock.
 */
async function snapToNearestEdge(): Promise<void> {
  if (!win || win.isDestroyed() || expanded) return;
  const b = win.getBounds();
  const work = workAreaFor();
  const margin = cfg.placement?.margin ?? 16;
  const T = cfg.placement?.snapThreshold ?? 64;

  let x = b.x;
  let y = b.y;
  if (b.x - work.x <= T) x = work.x + margin;
  else if (work.x + work.width - (b.x + b.width) <= T) x = work.x + work.width - b.width - margin;
  if (b.y - work.y <= T) y = work.y + margin;
  else if (work.y + work.height - (b.y + b.height) <= T) y = work.y + work.height - b.height - margin;

  if (x !== b.x || y !== b.y) await animateMoveTo(x, y);
  rememberDock();
  peekHome = null; // new home; next peek recomputes
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

/** A toggle that arrived mid-animation; applied once the current transition settles (no lost clicks). */
let pendingExpandTarget: boolean | null = null;

async function setExpanded(v: boolean, opts: { animate?: boolean } = {}): Promise<void> {
  const animate = opts.animate ?? true;
  // Don't drop clicks made during a transition — remember the latest intent and apply it after.
  if (expandAnimating) {
    pendingExpandTarget = v;
    return;
  }
  if (expanded === v && !animate) return;

  expandAnimating = animate;
  expanded = v;
  state.expanded = v;
  win.setBackgroundColor("#00000000");

  // Expanding out of a peek: drop the peek bookkeeping; applyPlacement below re-docks on-screen.
  if (v && peeking) {
    peeking = false;
    peekHome = null;
    win.webContents.send("widget:peek", { peeking: false });
  }

  // Collapsing after a summon: restore the real dock so the final applyPlacement glides Pip home.
  if (!v && preSummonDock) {
    state.corner = preSummonDock.corner;
    state.anchorX = preSummonDock.anchorX;
    state.anchorY = preSummonDock.anchorY;
    preSummonDock = null;
  }

  try {
    if (v) {
      const w = state.panelW || cfg.panel.defaultW;
      // Always open at the COMPACT height. The renderer grows the window only when there's real
      // content (a reply/snip). Restoring a stale tall height caused the open-tall-then-shrink
      // ("vertical then horizontal") reflow.
      const h = cfg.panel.compactH || cfg.panel.defaultH;
      state.panelH = h;
      win.setResizable(false);
      win.setMinimumSize(cfg.panel.minW, cfg.panel.minH);
      win.setMaximumSize(cfg.panel.maxW, cfg.panel.maxH);
      win.webContents.send("widget:expanded", true);
      win.show();
      // One atomic size+move (native animation on macOS). No per-frame loop, no overlapping resizes.
      resizeWindowTo(w, h, animate);
      win.focus();
    } else {
      win.webContents.send("widget:expanded", false);
      const cw = cfg.collapsed.w;
      const ch = cfg.collapsed.h;
      win.setResizable(false);
      win.setMinimumSize(cw, ch);
      win.setMaximumSize(cw, ch);
      resizeWindowTo(cw, ch, animate);
      win.show();
    }
  } finally {
    expandAnimating = false;
  }

  saveState();

  // If the user toggled again during the animation, honor that intent now.
  if (pendingExpandTarget !== null && pendingExpandTarget !== expanded) {
    const next = pendingExpandTarget;
    pendingExpandTarget = null;
    await setExpanded(next);
  } else {
    pendingExpandTarget = null;
  }
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
  if (peeking) peekIn(); // any interaction brings Pip back from a peek
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
  stopSpeaking(); // a new question interrupts any reply being read aloud
  send("widget:ask-start");
  try {
    const result = await askStream(cfg, text, (delta) => send("widget:ask-delta", { delta }), {
      resumeChatId: pipChatId,
      model: selectedModel,
    });
    rememberChatId(result.chatId);
    requestLog.finish(entry.id, {
      status: "done",
      response: result.text,
      chatId: result.chatId,
      durationMs: result.durationMs,
    });
    send("widget:ask-end", { text: result.text });
    speak(result.text);
    logActivity(cfg.workspace, { surface: "desktop", ask: text, outcome: result.text });
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
    speak(result.text);
    logActivity(cfg.workspace, {
      surface: "desktop (screen)",
      ask: question,
      outcome: result.text,
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
    if (!win || win.isDestroyed() || hidden) return;
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

/**
 * "Meet where you are": warp Pip next to the cursor (on whichever display holds it), expand, and focus
 * the input. Remembers the real dock so a later collapse/Esc glides Pip back home.
 */
async function summonToCursor(): Promise<void> {
  if (!win || win.isDestroyed()) return;
  pingActivity();
  const pt = screen.getCursorScreenPoint();
  const work = screen.getDisplayNearestPoint(pt).workArea;

  if (!preSummonDock) {
    preSummonDock = { corner: state.corner, anchorX: state.anchorX, anchorY: state.anchorY };
  }

  // Expand first so the window is panel-sized, then place it near the cursor (applyPlacement docks it,
  // so we override position afterward and skip the resulting "moved" bookkeeping).
  await setExpanded(true, { animate: false });
  const b = win.getBounds();
  const margin = 12;
  let x = pt.x + 18;
  let y = pt.y + 18;
  x = Math.min(Math.max(x, work.x + margin), work.x + work.width - b.width - margin);
  y = Math.min(Math.max(y, work.y + margin), work.y + work.height - b.height - margin);

  skipMovedSave += 2;
  win.setPosition(Math.round(x), Math.round(y), false);
  win.show();
  win.focus();

  // Stack replies away from whichever half of the screen we landed in.
  const edge = y + b.height / 2 >= work.y + work.height / 2 ? "bottom" : "top";
  if (edge !== lastDockEdge) {
    lastDockEdge = edge;
    win.webContents.send("widget:dock", { edge });
  }
  win.webContents.send("widget:summon");
}

/** Poll the cursor and tell the renderer where to point Pip's eyes. Cheap; pauses when hidden. */
function startGazeWatcher(): void {
  if (gazeTimer) clearInterval(gazeTimer);
  if (!cfg.personality.gaze || !cfg.personality.motion) return;

  const REACH = 260; // px from Pip's center that maps to a full eye deflection
  gazeTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const pt = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = Math.max(-1, Math.min(1, (pt.x - cx) / REACH));
    const dy = Math.max(-1, Math.min(1, (pt.y - cy) / REACH));
    if (Math.abs(dx - lastGaze.dx) < 0.04 && Math.abs(dy - lastGaze.dy) < 0.04) return;
    lastGaze = { dx, dy };
    win.webContents.send("widget:gaze", { dx, dy });
  }, 60);
}

/** Slide Pip mostly off the nearest edge, leaving a peeking sliver, after a stretch of idle. */
function peekOut(): void {
  if (!cfg.peek.enabled || peeking || hidden || expanded || expandAnimating) return;
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const b = win.getBounds();
  const work = workAreaFor();
  const dl = b.x - work.x;
  const dr = work.x + work.width - (b.x + b.width);
  const dt = b.y - work.y;
  const db = work.y + work.height - (b.y + b.height);
  const min = Math.min(dl, dr, dt, db);
  const inset = Math.round(Math.min(b.width, b.height) * cfg.peek.insetPct);
  peekHome = { x: b.x, y: b.y };
  let x = b.x;
  let y = b.y;
  if (min === dr) x = b.x + inset;
  else if (min === dl) x = b.x - inset;
  else if (min === db) y = b.y + inset;
  else y = b.y - inset;
  peeking = true;
  if (!win.isDestroyed()) win.webContents.send("widget:peek", { peeking: true });
  void animateMoveTo(x, y, 220);
}

/** Bring Pip fully back on-screen from a peek (on hover or when the user returns). */
function peekIn(): void {
  if (!peeking) return;
  peeking = false;
  const home = peekHome;
  peekHome = null;
  if (!win || win.isDestroyed()) return;
  win.webContents.send("widget:peek", { peeking: false });
  if (home) void animateMoveTo(home.x, home.y, 200);
}

function startPeekWatcher(): void {
  if (peekTimer) clearInterval(peekTimer);
  if (!cfg.peek.enabled) return;
  peekTimer = setInterval(() => {
    if (!win || win.isDestroyed() || hidden || expanded || expandAnimating) return;
    const idle = powerMonitor.getSystemIdleTime();
    if (!peeking && idle >= cfg.peek.idleSeconds) peekOut();
    else if (peeking && idle < 2) peekIn();
  }, 4000);
}

/** Meeting/screen-share safety: fully hide (or restore) Pip. Also silences peek + nudges. */
function setHidden(v: boolean): void {
  hidden = v;
  if (!win || win.isDestroyed()) return;
  if (v) {
    peeking = false;
    peekHome = null;
    stopSpeaking();
    win.hide();
  } else {
    applyPlacement();
    win.show();
  }
}

function toggleHidden(): void {
  setHidden(!hidden);
}

function registerHotkey(): void {
  globalShortcut.unregisterAll();

  const snip = cfg.hotkey.snip?.trim();
  if (snip) {
    const ok = globalShortcut.register(snip, () => {
      pingActivity();
      void runHotkeySnip().catch((err) => console.error("[hotkey] snip failed:", err));
    });
    if (ok) console.log(`Hotkey registered: ${snip} → snip & ask Pip`);
    else console.warn(`⚠ Could not register hotkey ${snip}`);
  }

  const summon = cfg.hotkey.summon?.trim();
  if (summon) {
    const ok = globalShortcut.register(summon, () => {
      void summonToCursor().catch((err) => console.error("[hotkey] summon failed:", err));
    });
    if (ok) console.log(`Hotkey registered: ${summon} → summon Pip to cursor`);
    else console.warn(`⚠ Could not register hotkey ${summon}`);
  }

  const hide = cfg.hotkey.hide?.trim();
  if (hide) {
    const ok = globalShortcut.register(hide, () => toggleHidden());
    if (ok) console.log(`Hotkey registered: ${hide} → hide/show Pip`);
    else console.warn(`⚠ Could not register hotkey ${hide}`);
  }
}

function restartPip(): void {
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

/** Reduce reply markdown to something that sounds natural when read aloud, and keep it short. */
function speechText(raw: string): string {
  let s = raw || "";
  s = s.replace(/```[\s\S]*?```/g, " (code snippet) "); // don't read code blocks char by char
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // images
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links → label
  s = s.replace(/https?:\/\/\S+/g, "a link");
  s = s.replace(/[#*_>~|]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 700) {
    const cut = s.slice(0, 700);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    s = (lastStop > 300 ? cut.slice(0, lastStop + 1) : cut).trim();
  }
  return s;
}

/** Stop any in-flight speech immediately. */
function stopSpeaking(): void {
  if (sayChild) {
    try {
      sayChild.kill();
    } catch {
      /* already gone */
    }
    sayChild = null;
  }
  if (win && !win.isDestroyed()) win.webContents.send("widget:speaking", { speaking: false });
}

/** Read a reply aloud via macOS `say` (no-op unless voiceOut is on). Interrupts prior speech. */
function speak(text: string): void {
  if (!voiceOut) return;
  const clean = speechText(text);
  if (!clean) return;
  stopSpeaking();
  if (win && !win.isDestroyed()) win.webContents.send("widget:speaking", { speaking: true });
  sayChild = execFile("say", [clean], () => {
    sayChild = null;
    if (win && !win.isDestroyed()) win.webContents.send("widget:speaking", { speaking: false });
  });
}

function setVoiceOut(v: boolean): void {
  voiceOut = v;
  state.voiceOut = v;
  saveState();
  if (!v) stopSpeaking();
  if (win && !win.isDestroyed()) win.webContents.send("widget:voice-out", { enabled: v });
}

/** The model text asks currently run on (selection wins, else the fast default). */
function currentModel(): string {
  return selectedModel?.trim() || cfg.agentFastModel || cfg.agentModel || "auto";
}

function setSelectedModel(model: string | undefined): void {
  const m = model?.trim();
  if (!m) return;
  selectedModel = m;
  state.model = m;
  saveState();
  if (win && !win.isDestroyed()) win.webContents.send("widget:model", { model: m });
}

/** Native picker for the runtime model switcher — makes "any model" tangible on camera. */
function showModelMenu(): void {
  const cur = currentModel();
  const menu = Menu.buildFromTemplate(
    cfg.models.map((m) => ({
      label: m,
      type: "radio" as const,
      checked: m === cur,
      click: () => setSelectedModel(m),
    })),
  );
  menu.popup({ window: win });
}

/** "Command+Shift+H" → "⌘⇧H" for menu hints. */
function prettyAccelerator(acc: string): string {
  return acc
    .replace(/Command|Cmd/gi, "⌘")
    .replace(/Shift/gi, "⇧")
    .replace(/Option|Alt/gi, "⌥")
    .replace(/Control|Ctrl/gi, "⌃")
    .replace(/\+/g, "");
}

function showContextMenu(): void {
  const menu = Menu.buildFromTemplate([
    { label: "Snip screen", click: () => void runHotkeySnip() },
    { label: "Open tasks.md", click: () => shell.openPath(cfg.tasksFile) },
    { label: "Open monitor", click: () => openMonitorDashboard() },
    { type: "separator" },
    { label: `Model: ${currentModel()}`, click: () => showModelMenu() },
    { label: "Speak replies", type: "checkbox", checked: voiceOut, click: () => setVoiceOut(!voiceOut) },
    { type: "separator" },
    { label: expanded ? "Minimize" : "Open", click: () => void setExpanded(!expanded) },
    {
      label: `Hide Pip${cfg.hotkey.hide ? `  (${prettyAccelerator(cfg.hotkey.hide)})` : ""}`,
      click: () => setHidden(true),
    },
    { label: "Restart Pip", click: () => restartPip() },
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
    personality: cfg.personality,
    nudge: cfg.nudge,
    voice: cfg.voice,
    monitor: cfg.monitor,
    models: cfg.models,
    model: currentModel(),
  }));

  ipcMain.handle("agent:model-menu", () => {
    pingActivity();
    showModelMenu();
  });
  ipcMain.handle("agent:set-model", (_e, p: { model: string }) => {
    setSelectedModel(p?.model);
    return currentModel();
  });

  ipcMain.handle("voice:toggle-out", () => {
    setVoiceOut(!voiceOut);
    return voiceOut;
  });
  ipcMain.handle("voice:stop", () => stopSpeaking());
  ipcMain.handle("voice:state", () => ({ speakReplies: voiceOut, autoSend: cfg.voice.autoSend }));

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
  ipcMain.handle("window:snap", () => snapToNearestEdge());
  ipcMain.handle("window:resize-by", (_e, p: { dw: number; dh: number }) => {
    const { w, h } = clampPanel(state.panelW + p.dw, state.panelH + p.dh);
    state.panelW = w; state.panelH = h;
    win.setSize(w, h, false);
    saveState();
  });
  ipcMain.handle("window:set-panel-size", (_e, p: { w: number; h: number }) => {
    if (!expanded || !win || win.isDestroyed()) return;
    const { w, h } = clampPanel(p.w, p.h);
    const b = win.getBounds();
    if (Math.abs(b.width - w) < 2 && Math.abs(b.height - h) < 2) return; // no real change → no resize
    state.panelW = w;
    state.panelH = h;
    // Safe now that (a) hardware acceleration is off and (b) resizeWindowTo is a single atomic bounds
    // change — the crash was the old per-frame loop colliding with this. This is the grow-to-fit that
    // makes room for the toolbar + any reply, so it must be allowed to run right after expand.
    resizeWindowTo(w, h, false);
    saveState();
  });
  ipcMain.handle("window:get-bounds", () => win.getBounds());
}

function createWindow(): void {
  state = loadState();
  // Always start collapsed — avoids window/UI size mismatch showing desktop bleed-through.
  state.expanded = false;

  const home = initialCornerPosition();
  win = new BrowserWindow({
    width: cfg.collapsed.w,
    height: cfg.collapsed.h,
    x: home.x,
    y: home.y,
    show: false, // stay hidden until placed + painted, so Pip never flashes at the wrong spot
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

  // Runs on the initial load AND after any renderer reload (e.g. after a crash), so Pip always comes
  // back collapsed, correctly placed, and in sync with the main process — never half-rendered.
  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    expanded = false;
    state.expanded = false;
    win.setResizable(false);
    win.setSize(cfg.collapsed.w, cfg.collapsed.h, false);
    win.setMinimumSize(cfg.collapsed.w, cfg.collapsed.h);
    win.setMaximumSize(cfg.collapsed.w, cfg.collapsed.h);
    win.webContents.send("widget:expanded", false);
    if (selectedModel) win.webContents.send("widget:model", { model: currentModel() });
    win.webContents.send("widget:voice-out", { enabled: voiceOut });
    applyPlacement();
    lastDockEdge = null;
    sendDock();
    if (!hidden && !win.isVisible()) win.showInactive();
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

  // Snapshot existing Lens tasks so only ones assigned from now on pop Pip.
  void detectLensTasks(true);
}

// Pip is a small, frameless, TRANSPARENT, always-on-top window. On macOS, GPU compositing of a
// transparent window across resize/show intermittently crashes the GPU process, which took the whole
// app down a few seconds after expanding (the "Pip vanishes / have to click many times / inconsistent"
// bug). Software compositing is plenty fast for a widget this size and makes it rock-solid.
app.disableHardwareAcceleration();

// Only one Pip at a time. A second launch just wakes the existing one instead of spawning a rival
// orb (which would fight over the hotkeys and the monitor port and make behavior feel random).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!win || win.isDestroyed()) return;
  if (hidden) setHidden(false);
  if (!win.isVisible()) win.show();
  win.focus();
});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return; // another instance already owns Pip
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
  selectedModel = state.model ?? null;
  voiceOut = state.voiceOut ?? cfg.voice.speakReplies;
  registerHotkey();
  startNudgeWatcher();
  startGazeWatcher();
  startPeekWatcher();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopSpeaking();
  if (nudgeTimer) clearInterval(nudgeTimer);
  if (gazeTimer) clearInterval(gazeTimer);
  if (peekTimer) clearInterval(peekTimer);
});

app.on("window-all-closed", () => app.quit());
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
