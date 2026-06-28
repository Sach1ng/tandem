import { contextBridge, ipcRenderer } from "electron";

/** The only surface the renderer can touch. Everything goes through ipcRenderer.invoke/.on. */
const taskWidget = {
  // tasks
  getTasks: () => ipcRenderer.invoke("tasks:get"),
  refresh: () => ipcRenderer.invoke("tasks:refresh"),
  toggleDone: (id: string) => ipcRenderer.invoke("tasks:toggle", id),
  moveTask: (id: string, toSection: string) => ipcRenderer.invoke("tasks:move", { id, toSection }),

  // ai actions
  capture: (text: string) => ipcRenderer.invoke("agent:capture", { text }),
  groom: () => ipcRenderer.invoke("agent:groom"),
  snip: (): Promise<string | null> => ipcRenderer.invoke("screenshot:capture"),
  askScreenshot: (path: string, question: string) =>
    ipcRenderer.invoke("agent:ask-screenshot", { path, question }),

  // window / chrome
  toggleExpand: () => ipcRenderer.invoke("widget:toggle"),
  setExpanded: (v: boolean) => ipcRenderer.invoke("widget:expand", v),
  showContextMenu: () => ipcRenderer.invoke("widget:context-menu"),
  openTasksFile: () => ipcRenderer.invoke("shell:open-tasks"),
  dragBy: (dx: number, dy: number) => ipcRenderer.invoke("window:drag-by", { dx, dy }),
  resizeBy: (dw: number, dh: number) => ipcRenderer.invoke("window:resize-by", { dw, dh }),
  setPanelSize: (w: number, h: number) => ipcRenderer.invoke("window:set-panel-size", { w, h }),
  getWindowBounds: () => ipcRenderer.invoke("window:get-bounds"),
  getConfig: () => ipcRenderer.invoke("config:get"),

  // events
  onUpdated: (cb: (tasks: unknown) => void) =>
    ipcRenderer.on("tasks:updated", (_e, tasks) => cb(tasks)),
  onExpanded: (cb: (v: boolean) => void) =>
    ipcRenderer.on("widget:expanded", (_e, v) => cb(v)),
  onShowTriage: (cb: () => void) => ipcRenderer.on("widget:show-triage", () => cb()),
  onSnip: (cb: () => void) => ipcRenderer.on("widget:snip", () => cb()),
};

contextBridge.exposeInMainWorld("taskWidget", taskWidget);
