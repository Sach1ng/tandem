import { execFile, spawn } from "node:child_process";
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
  if (opts.mode) {
    args.push("--mode", opts.mode);
  }
  if (force) {
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

/**
 * Run cursor-agent and stream assistant text as it is generated.
 *
 * cursor-agent buffers the whole answer in `json` mode, so the UI would sit on
 * "Thinking…" for the full model latency and then dump a wall of text. Here we
 * force `stream-json --stream-partial-output`, parse the newline-delimited
 * events, and hand each text delta to `onDelta` so the answer types out live.
 *
 * Returns the same AgentResult as runAgent once the process closes, using the
 * authoritative `result` event text when present (falling back to accumulated
 * deltas). Startup cost is unchanged; perceived latency drops a lot.
 */
export async function runAgentStream(
  cfg: EngineConfig,
  opts: RunAgentOptions,
  onDelta: (delta: string) => void,
): Promise<AgentResult> {
  const bin = cfg.cliBin ?? DEFAULTS.cliBin;
  const args = buildArgs(cfg, { ...opts, outputFormat: "stream-json" });
  args.push("--stream-partial-output");
  const startedAt = Date.now();

  return new Promise<AgentResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: cfg.workspace,
      env: process.env,
      signal: opts.signal,
    });

    let buf = "";
    let acc = "";
    let finalText = "";
    let chatId: string | null = null;
    let stderr = "";
    let settled = false;

    const fail = (err: EngineError) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const handleEvent = (ev: Record<string, unknown>) => {
      if (typeof ev.session_id === "string") chatId = ev.session_id;
      if (ev.type === "assistant") {
        const parts = (ev.message as { content?: unknown } | undefined)?.content;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const p = part as { type?: string; text?: string };
            if (p?.type === "text" && typeof p.text === "string" && p.text) {
              acc += p.text;
              try {
                onDelta(p.text);
              } catch {
                /* renderer gone; keep accumulating */
              }
            }
          }
        }
      } else if (ev.type === "result" && typeof ev.result === "string") {
        finalText = ev.result;
      }
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          handleEvent(JSON.parse(line) as Record<string, unknown>);
        } catch {
          /* ignore non-JSON lines */
        }
      }
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        fail(
          new EngineError(
            `cursor-agent not found (looked for "${bin}"). Install it: curl https://cursor.com/install -fsS | bash, then run: cursor-agent login`,
            { cause: err },
          ),
        );
        return;
      }
      fail(new EngineError(`cursor-agent failed to start: ${err.message}`, { cause: err }));
    });

    child.on("close", (code) => {
      if (settled) return;
      const text = (finalText || acc).trim();
      if (!text && code !== 0) {
        fail(new EngineError(`cursor-agent exited with code ${code}: ${stderr.trim()}`, { code }));
        return;
      }
      settled = true;
      resolve({ text, chatId, raw: acc, parsed: true, durationMs: Date.now() - startedAt });
    });
  });
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
