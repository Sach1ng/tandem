export type OutputFormat = "text" | "json" | "stream-json";

/** Read-only execution modes. `plan` / `ask` never write or run shell. */
export type AgentMode = "plan" | "ask";

export interface EngineConfig {
  /** Binary name or absolute path. Default: "cursor-agent". */
  cliBin?: string;
  /** Model id, e.g. "gpt-5", "sonnet-4", or "auto" to let Cursor pick. Default: "auto". */
  model?: string;
  /** Working directory passed as --workspace and used as cwd. */
  workspace: string;
  /** Hard timeout per run in ms. Default: 600_000 (10 min). */
  timeoutMs?: number;
  /** Max stdout buffer in bytes. Default: 32 MiB. */
  maxBuffer?: number;
  /**
   * Allow all tool calls without prompting (--force / --yolo).
   * This is remote code execution by design — gate the surface on an allow-list.
   * Default: true. Set false (with mode "plan"/"ask") for read-only actions.
   */
  force?: boolean;
  /** Trust the workspace headlessly (--trust). Required with -p. Default: true. */
  trust?: boolean;
}

export interface RunAgentOptions {
  prompt: string;
  /** Resume a prior cursor-agent chat so context carries across calls. */
  resumeChatId?: string | null;
  /** json for surfaces that need the chat id back; text for one-shots. Default: "json". */
  outputFormat?: OutputFormat;
  /** Read-only override for a single call (e.g. a "safe" groom). */
  mode?: AgentMode;
  /** Per-call model override. */
  model?: string;
  /** Override force for a single call (e.g. capture writes vs groom reads). */
  force?: boolean;
  /** Cancellation. */
  signal?: AbortSignal;
}

export interface AgentResult {
  /** Final assistant text, extracted tolerantly across CLI versions. */
  text: string;
  /** Chat id to pass to a later --resume, or null if not present / not JSON. */
  chatId: string | null;
  /** Raw stdout, untouched. */
  raw: string;
  /** Whether stdout parsed as JSON. */
  parsed: boolean;
  /** Wall-clock duration in ms. */
  durationMs: number;
}
