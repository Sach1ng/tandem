import { join } from "node:path";
import { JsonStore } from "@tandem/core";

const STATE_DIR = join(process.cwd(), "state");

export function threadKey(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

/** Dedupe set of handled message timestamps. Capped so it never grows unbounded. */
export class ProcessedStore {
  private store = new JsonStore<{ ts: string[] }>(join(STATE_DIR, "processed.json"), { ts: [] });
  private set: Set<string>;
  private readonly cap = 5000;

  constructor() {
    this.set = new Set(this.store.get().ts);
  }

  has(ts: string): boolean {
    return this.set.has(ts);
  }

  markHandled(ts: string): void {
    if (this.set.has(ts)) return;
    this.set.add(ts);
    if (this.set.size > this.cap) {
      // Drop the oldest ~10% (Slack ts are lexicographically sortable).
      const sorted = [...this.set].sort();
      for (const old of sorted.slice(0, Math.floor(this.cap * 0.1))) this.set.delete(old);
    }
    this.store.update((d) => {
      d.ts = [...this.set];
    });
  }
}

/** thread → cursor-agent chat id, for --resume continuity. */
export class SessionStore {
  private store = new JsonStore<{ sessions: Record<string, string> }>(
    join(STATE_DIR, "sessions.json"),
    { sessions: {} },
  );

  getChatId(key: string): string | null {
    return this.store.get().sessions[key] ?? null;
  }

  setChatId(key: string, chatId: string): void {
    this.store.update((d) => {
      d.sessions[key] = chatId;
    });
  }
}

/** Temporary per-thread access grants for non-owners. */
export class OpenThreadStore {
  private store = new JsonStore<{ grants: Record<string, number> }>(
    join(STATE_DIR, "open-threads.json"),
    { grants: {} },
  );

  isOpen(key: string): boolean {
    this.prune();
    const exp = this.store.get().grants[key];
    return exp != null && exp > Date.now();
  }

  grant(key: string, ttlMs: number): void {
    this.store.update((d) => {
      d.grants[key] = Date.now() + ttlMs;
    });
  }

  revoke(key: string): void {
    this.store.update((d) => {
      delete d.grants[key];
    });
  }

  private prune(): void {
    const now = Date.now();
    this.store.update((d) => {
      for (const [k, exp] of Object.entries(d.grants)) {
        if (exp <= now) delete d.grants[k];
      }
    });
  }
}
