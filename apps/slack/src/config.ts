import { resolveWorkspace } from "@tandem/core";
import { loadEnvFile } from "./env-file.ts";
import { REPO_ROOT, slackEnvPath } from "./paths.ts";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env var: ${name}.`);
    console.error(`Run: tandem slack connect   (OAuth — recommended)`);
    console.error(`  or: tandem slack setup   (manual token entry)`);
    console.error(`Config: ${slackEnvPath()}`);
    process.exit(1);
  }
  return v;
}

export interface SlackConfig {
  botToken: string;
  appToken: string;
  userToken: string | null;
  allowedUsers: string[];
  workdir: string;
  cursorBin: string;
  model: string;
  maxRuntimeMs: number;
  openThreadTtlMs: number;
}

export function loadConfig(): SlackConfig {
  loadEnvFile(slackEnvPath());

  const allowed = (process.env.ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    botToken: required("SLACK_BOT_TOKEN"),
    appToken: required("SLACK_APP_TOKEN"),
    userToken: process.env.SLACK_USER_TOKEN?.trim() || null,
    allowedUsers: allowed,
    workdir: resolveWorkspace(REPO_ROOT),
    cursorBin: process.env.CURSOR_BIN?.trim() || "cursor-agent",
    model: process.env.CURSOR_MODEL?.trim() || "auto",
    maxRuntimeMs: Number(process.env.MAX_RUNTIME_MS ?? 600_000),
    openThreadTtlMs: Number(process.env.OPEN_THREAD_TTL_MS ?? 20 * 60 * 60 * 1000),
  };
}

/** Load Slack env into process.env without exiting — for status checks. */
export function hydrateSlackEnv(): void {
  loadEnvFile(slackEnvPath());
}
