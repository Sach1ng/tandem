import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Default workspace = the Tandem repo root, so AGENTS.md + the PM OS submodule are on disk. */
const REPO_ROOT = resolve(__dirname, "../../..");

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
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
  const allowed = (process.env.ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    botToken: required("SLACK_BOT_TOKEN"),
    appToken: required("SLACK_APP_TOKEN"),
    // User token is only needed for the search.messages polling fallback.
    userToken: process.env.SLACK_USER_TOKEN?.trim() || null,
    allowedUsers: allowed,
    workdir: process.env.CURSOR_WORKDIR?.trim() || REPO_ROOT,
    cursorBin: process.env.CURSOR_BIN?.trim() || "cursor-agent",
    model: process.env.CURSOR_MODEL?.trim() || "auto",
    maxRuntimeMs: Number(process.env.MAX_RUNTIME_MS ?? 600_000),
    openThreadTtlMs: Number(process.env.OPEN_THREAD_TTL_MS ?? 20 * 60 * 60 * 1000),
  };
}
