import type { SlackConfig } from "./config.ts";
import { OpenThreadStore, threadKey } from "./state.ts";

const OPEN_RE = /^open(\s+(this\s+)?thread)?(\s+(to|for)\s+(everyone|all|anyone))?$/i;
const CLOSE_RE = /^close(\s+(this\s+)?thread)?$/i;

export type AccessCommand = "open" | "close" | null;

/** Detect an owner-only access command in the (mention-stripped) text. */
export function parseAccessCommand(text: string): AccessCommand {
  const t = text.trim();
  if (OPEN_RE.test(t)) return "open";
  if (CLOSE_RE.test(t)) return "close";
  return null;
}

export class AccessGate {
  constructor(
    private readonly cfg: SlackConfig,
    private readonly openThreads: OpenThreadStore,
  ) {}

  isOwner(userId: string): boolean {
    return this.cfg.allowedUsers.length === 0 || this.cfg.allowedUsers.includes(userId);
  }

  /** Owners always pass. Non-owners pass only inside a thread the owner opened. */
  canRun(userId: string, channel: string, threadTs: string): boolean {
    if (this.isOwner(userId)) return true;
    return this.openThreads.isOpen(threadKey(channel, threadTs));
  }

  open(channel: string, threadTs: string): void {
    this.openThreads.grant(threadKey(channel, threadTs), this.cfg.openThreadTtlMs);
  }

  close(channel: string, threadTs: string): void {
    this.openThreads.revoke(threadKey(channel, threadTs));
  }
}
