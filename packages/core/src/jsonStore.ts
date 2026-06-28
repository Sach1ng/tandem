import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Tiny atomic JSON file store. Writes go to a temp file then rename() so a crash
 * mid-write never leaves a half-written file. Reads tolerate a missing/corrupt file.
 */
export class JsonStore<T extends object> {
  private data: T;

  constructor(
    private readonly path: string,
    private readonly defaults: T,
  ) {
    this.data = this.load();
  }

  private load(): T {
    try {
      const raw = readFileSync(this.path, "utf8");
      return { ...this.defaults, ...(JSON.parse(raw) as T) };
    } catch {
      return structuredClone(this.defaults);
    }
  }

  get(): T {
    return this.data;
  }

  /** Mutate in place via the callback, then persist atomically. */
  update(mutate: (data: T) => void): void {
    mutate(this.data);
    this.flush();
  }

  flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}

/**
 * Serializes async work per key so follow-ups in the same Slack thread don't race
 * the session file (Build Spec: "Serialize per-thread via a promise queue").
 */
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    // Keep the chain alive but don't leak rejections into the tail.
    this.tails.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}
