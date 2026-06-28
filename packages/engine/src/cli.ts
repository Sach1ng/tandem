import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractResult } from "./extract.ts";
import type { AgentResult, EngineConfig, RunAgentOptions } from "./types.ts";

const execFileAsync = promisify(execFile);

const DEFAULTS = {
  cliBin: "cursor-agent",
  model: "auto",
  timeoutMs: 600_000,
  maxBuffer: 32 * 1024 * 1024,
} as const;

/** Thrown when the run did not produce a usable result (non-zero exit, timeout, missing CLI). */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly opts: { code?: number | null; stderr?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/**
 * Build the cursor-agent argv. Order mirrors the Build Spec:
 *   -p <prompt> --output-format <fmt> --model <m> [--force] [--trust] --workspace <dir>
 *   [--mode <mode>] [--resume <chatId>]
 *
 * Note: cursor-agent has NO --system-prompt flag. Persona/charter is delivered via the
 * prepended prompt string plus auto-loaded AGENTS.md and .cursor/rules/*.mdc.
 */
export function buildArgs(cfg: EngineConfig, opts: RunAgentOptions): string[] {
  const force = opts.force ?? cfg.force ?? true;
  const trust = cfg.trust ?? true;
  const args: string[] = [
    "-p",
    opts.prompt,
    "--output-format",
    opts.outputFormat ?? "json",
    "--model",
    opts.model ?? cfg.model ?? DEFAULTS.model,
  ];
  // Read-only modes are inherently safe; don't also pass --force there.
  if (opts.mode) {
    args.push("--mode", opts.mode);
  } else if (force) {
    args.push("--force");
  }
  if (trust) args.push("--trust");
  args.push("--workspace", cfg.workspace);
  if (opts.resumeChatId) args.push("--resume", opts.resumeChatId);
  return args;
}

/**
 * Run cursor-agent once and return the extracted result. Uses execFile (not a shell)
 * so the prompt is passed as a single argv entry and never interpolated into a command line.
 */
export async function runAgent(
  cfg: EngineConfig,
  opts: RunAgentOptions,
): Promise<AgentResult> {
  const bin = cfg.cliBin ?? DEFAULTS.cliBin;
  const args = buildArgs(cfg, opts);
  const startedAt = Date.now();
  try {
    const { stdout } = await execFileAsync(bin, args, {
      cwd: cfg.workspace,
      timeout: cfg.timeoutMs ?? DEFAULTS.timeoutMs,
      maxBuffer: cfg.maxBuffer ?? DEFAULTS.maxBuffer,
      signal: opts.signal,
      env: process.env,
    });
    const { text, chatId, parsed } = extractResult(stdout);
    return { text, chatId, raw: stdout, parsed, durationMs: Date.now() - startedAt };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
    if (e.code === "ENOENT") {
      throw new EngineError(
        `cursor-agent not found (looked for "${bin}"). Install it: curl https://cursor.com/install -fsS | bash, then run: cursor-agent login`,
        { cause: err },
      );
    }
    if (e.killed) {
      throw new EngineError(`cursor-agent timed out after ${cfg.timeoutMs ?? DEFAULTS.timeoutMs}ms`, {
        cause: err,
      });
    }
    // Some non-zero exits still emit a useful JSON/text payload on stdout.
    if (e.stdout && e.stdout.trim()) {
      const { text, chatId, parsed } = extractResult(e.stdout);
      if (text) {
        return { text, chatId, raw: e.stdout, parsed, durationMs: Date.now() - startedAt };
      }
    }
    throw new EngineError(`cursor-agent exited with an error: ${e.stderr?.trim() || e.message}`, {
      code: typeof e.code === "number" ? e.code : null,
      stderr: e.stderr,
      cause: err,
    });
  }
}

/** Quick availability probe. Returns the version string, or null if the CLI is missing. */
export async function checkCli(cliBin: string = DEFAULTS.cliBin): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cliBin, ["--version"], { timeout: 10_000 });
    return stdout.trim();
  } catch {
    return null;
  }
}
