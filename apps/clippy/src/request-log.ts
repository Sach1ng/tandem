import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type RequestStatus = "running" | "done" | "error";
export type RequestKind = "ask" | "screenshot" | "capture" | "groom" | "snip";
export type RequestSource = "ui" | "hotkey" | "menu";

export interface PipRequest {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  source: RequestSource;
  question?: string;
  screenshotPath?: string;
  previewPath?: string;
  response?: string;
  error?: string;
  chatId?: string | null;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface StartRequestInput {
  kind: RequestKind;
  source?: RequestSource;
  question?: string;
  screenshotPath?: string;
  previewPath?: string;
}

const MAX_REQUESTS = 500;

export class RequestLog extends EventEmitter {
  private requests: PipRequest[] = [];
  private readonly storePath: string;

  constructor(workspace: string) {
    super();
    const dir = join(workspace, ".tandem");
    mkdirSync(dir, { recursive: true });
    this.storePath = join(dir, "pip-requests.json");
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.storePath, "utf8")) as PipRequest[];
      if (Array.isArray(raw)) this.requests = raw.slice(0, MAX_REQUESTS);
    } catch {
      this.requests = [];
    }
  }

  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private persist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        writeFileSync(this.storePath, `${JSON.stringify(this.requests, null, 2)}\n`);
      } catch (err) {
        console.error("[pip-monitor] persist failed:", err);
      }
    }, 150);
  }

  private emitUpdate(req: PipRequest): void {
    this.emit("update", req);
  }

  list(limit = MAX_REQUESTS): PipRequest[] {
    return this.requests.slice(0, limit);
  }

  active(): PipRequest[] {
    return this.requests.filter((r) => r.status === "running");
  }

  get(id: string): PipRequest | undefined {
    return this.requests.find((r) => r.id === id);
  }

  start(input: StartRequestInput): PipRequest {
    const req: PipRequest = {
      id: randomUUID(),
      kind: input.kind,
      status: "running",
      source: input.source ?? "ui",
      question: input.question,
      screenshotPath: input.screenshotPath,
      previewPath: input.previewPath,
      startedAt: Date.now(),
    };
    this.requests.unshift(req);
    if (this.requests.length > MAX_REQUESTS) this.requests.length = MAX_REQUESTS;
    this.persist();
    this.emitUpdate(req);
    return req;
  }

  finish(
    id: string,
    patch: {
      status?: RequestStatus;
      response?: string;
      error?: string;
      chatId?: string | null;
      durationMs?: number;
    },
  ): PipRequest | undefined {
    const req = this.requests.find((r) => r.id === id);
    if (!req) return undefined;
    if (patch.status) req.status = patch.status;
    if (patch.response !== undefined) req.response = patch.response;
    if (patch.error !== undefined) req.error = patch.error;
    if (patch.chatId !== undefined) req.chatId = patch.chatId;
    if (patch.durationMs !== undefined) req.durationMs = patch.durationMs;
    req.finishedAt = Date.now();
    if (!req.durationMs && req.finishedAt) req.durationMs = req.finishedAt - req.startedAt;
    this.persist();
    this.emitUpdate(req);
    return req;
  }
}
