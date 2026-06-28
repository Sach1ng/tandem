import type { WebClient } from "@slack/web-api";
import type { KeyedQueue } from "@tandem/core";
import type { SlackConfig } from "./config.ts";
import type { AccessGate } from "./access.ts";
import type { ProcessedStore, SessionStore } from "./state.ts";

export interface NormalizedMessage {
  channel: string;
  ts: string;
  threadTs?: string;
  user: string;
  text: string;
  channelType?: string; // "im" | "channel" | "group" | "mpim"
  source: "socket" | "search" | "dm-poll";
}

export interface Ctx {
  cfg: SlackConfig;
  botUserId: string;
  botClient: WebClient;
  userClient: WebClient | null;
  processed: ProcessedStore;
  sessions: SessionStore;
  gate: AccessGate;
  queue: KeyedQueue;
  bootTs: number;
}
