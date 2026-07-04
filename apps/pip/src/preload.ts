import { contextBridge, ipcRenderer } from "electron";
import { pathToFileURL } from "node:url";

/** The only surface the renderer can touch. Everything goes through ipcRenderer.invoke/.on. */
const taskWidget = {
  // tasks
  getTasks: () => ipcRenderer.invoke("tasks:get"),
  refresh: () => ipcRenderer.invoke("tasks:refresh"),
  toggleDone: (id: string) => ipcRenderer.invoke("tasks:toggle", id),
  moveTask: (id: string, toSection: string) => ipcRenderer.invoke("tasks:move", { id, toSection }),

  // ai actions
  capture: (text: string) => ipcRenderer.invoke("agent:capture", { text }),
  ask: (text: string) => ipcRenderer.invoke("agent:ask", { text }),
  groom: () => ipcRenderer.invoke("agent:groom"),
  openModelMenu: () => ipcRenderer.invoke("agent:model-menu"),
  setModel: (model: string) => ipcRenderer.invoke("agent:set-model", { model }),

  // voice
  toggleVoiceOut: (): Promise<boolean> => ipcRenderer.invoke("voice:toggle-out"),
  stopSpeaking: () => ipcRenderer.invoke("voice:stop"),
  getVoiceState: (): Promise<{ speakReplies: boolean; autoSend: boolean }> =>
    ipcRenderer.invoke("voice:state"),
  ensureMicAccess: (): Promise<boolean> => ipcRenderer.invoke("voice:ensure-mic"),
  snip: (): Promise<{ path: string; previewUrl: string } | null> =>
    ipcRenderer.invoke("screenshot:capture"),
  screenshotPreviewUrl: (path: string) => pathToFileURL(path).href,
  askScreenshot: (path: string, question: string) =>
    ipcRenderer.invoke("agent:ask-screenshot", { path, question }),

  // window / chrome
  toggleExpand: () => ipcRenderer.invoke("widget:toggle"),
  setExpanded: (v: boolean) => ipcRenderer.invoke("widget:expand", v),
  showContextMenu: () => ipcRenderer.invoke("widget:context-menu"),
  openTasksFile: () => ipcRenderer.invoke("shell:open-tasks"),
  dragBy: (dx: number, dy: number) => ipcRenderer.invoke("window:drag-by", { dx, dy }),
  snapDock: () => ipcRenderer.invoke("window:snap"),
  resizeBy: (dw: number, dh: number) => ipcRenderer.invoke("window:resize-by", { dw, dh }),
  setPanelSize: (w: number, h: number) => ipcRenderer.invoke("window:set-panel-size", { w, h }),
  getWindowBounds: () => ipcRenderer.invoke("window:get-bounds"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  pingActivity: () => ipcRenderer.invoke("widget:activity"),

  // events
  onUpdated: (cb: (tasks: unknown) => void) =>
    ipcRenderer.on("tasks:updated", (_e, tasks) => cb(tasks)),
  onExpanded: (cb: (v: boolean) => void) =>
    ipcRenderer.on("widget:expanded", (_e, v) => cb(v)),
  onDock: (cb: (p: { edge: "top" | "bottom" }) => void) =>
    ipcRenderer.on("widget:dock", (_e, p) => cb(p)),
  onShowTriage: (cb: () => void) => ipcRenderer.on("widget:show-triage", () => cb()),
  onSnip: (cb: () => void) => ipcRenderer.on("widget:snip", () => cb()),
  onSnipResult: (cb: (p: { path: string; status: string; text?: string }) => void) =>
    ipcRenderer.on("widget:snip-result", (_e, p) => cb(p)),
  onSnipReady: (cb: (p: { path: string }) => void) =>
    ipcRenderer.on("widget:snip-ready", (_e, p) => cb(p)),
  onNudge: (cb: (p: { idleSeconds: number; message: string }) => void) =>
    ipcRenderer.on("widget:nudge", (_e, p) => cb(p)),
  onNudgeClear: (cb: () => void) => ipcRenderer.on("widget:nudge-clear", () => cb()),
  onWorking: (cb: (p: { active: boolean; label?: string }) => void) =>
    ipcRenderer.on("widget:working", (_e, p) => cb(p)),
  onAskStart: (cb: () => void) => ipcRenderer.on("widget:ask-start", () => cb()),
  onAskDelta: (cb: (p: { delta: string }) => void) =>
    ipcRenderer.on("widget:ask-delta", (_e, p) => cb(p)),
  onAskEnd: (cb: (p: { text: string; error?: boolean }) => void) =>
    ipcRenderer.on("widget:ask-end", (_e, p) => cb(p)),
  onGaze: (cb: (p: { dx: number; dy: number }) => void) =>
    ipcRenderer.on("widget:gaze", (_e, p) => cb(p)),
  onSummon: (cb: (p?: { voice?: boolean }) => void) =>
    ipcRenderer.on("widget:summon", (_e, p) => cb(p)),
  onPeek: (cb: (p: { peeking: boolean }) => void) =>
    ipcRenderer.on("widget:peek", (_e, p) => cb(p)),
  onSpeaking: (cb: (p: { speaking: boolean }) => void) =>
    ipcRenderer.on("widget:speaking", (_e, p) => cb(p)),
  onVoiceOut: (cb: (p: { enabled: boolean }) => void) =>
    ipcRenderer.on("widget:voice-out", (_e, p) => cb(p)),
  onModel: (cb: (p: { model: string }) => void) =>
    ipcRenderer.on("widget:model", (_e, p) => cb(p)),
  onLensTask: (
    cb: (p: {
      id: string;
      title: string;
      source: string | null;
      page: string | null;
      outcome: string;
      project: string | null;
      priority: string | null;
    }) => void,
  ) => ipcRenderer.on("widget:lens-task", (_e, p) => cb(p)),
};

contextBridge.exposeInMainWorld("taskWidget", taskWidget);
