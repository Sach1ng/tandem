import { createServer } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, checkCli, EngineError } from "@tandem/engine";
import {
  readCharter,
  readMemory,
  resolveWorkspace,
  appendWebTask,
  appendTaskSubBullet,
  resolveTasksFile,
  logActivity,
} from "@tandem/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const PORT = Number(process.env.TANDEM_BRIDGE_PORT ?? 8765);
const WORKDIR = resolveWorkspace(REPO_ROOT);
const TASKS_FILE = resolveTasksFile(WORKDIR);
const MODEL = process.env.CURSOR_MODEL?.trim() || "auto";
const CURSOR_BIN = process.env.CURSOR_BIN?.trim() || "cursor-agent";
const TIMEOUT_MS = Number(process.env.TANDEM_BRIDGE_TIMEOUT_MS ?? 600_000);

const AUTONOMY = `Act autonomously with full tool access (WebSearch, WebFetch, shell, file writes, Task subagents).
Never stop to ask for confirmation — use sensible defaults and complete the task end-to-end.
User skills in ~/.cursor/skills/ are available (including research, research-deep, research-report).
For research tasks: run the full pipeline when asked (outline → deep → report) without human-in-the-loop.
Write artifacts under the workspace; lead the saved outcome with a concise BLUF, then paths/files created.`;

const BROWSER_PERSONA = `You are Pip, Tandem's page-aware browser surface. The user is looking at a web
page and has asked you something about it. Lead with the answer. Be concise and skimmable.
Use the page context provided. If it is a PM artifact (PRD, ticket, dashboard, doc), apply the
relevant PM OS skill from the workspace. Never invent facts; if the page context is insufficient, say so.

${AUTONOMY}`;

const ASSIGN_PERSONA = `You are Pip, Tandem's page-aware browser surface, acting on a task the user
just assigned from a web page (or typed directly). Do the task now using any context provided, then
lead with the result. This answer is saved to the user's task board and shown on their desktop.
If context is thin, use WebSearch and workspace skills to finish anyway — state assumptions briefly.

${AUTONOMY}`;

interface AskBody {
  url?: string;
  title?: string;
  selection?: string;
  excerpt?: string;
  question?: string;
}

interface AssignBody extends AskBody {
  instruction?: string;
  priority?: "p0" | "p1" | "p2";
  project?: string;
}

function pageContext(b: AskBody): string[] {
  const ctx: string[] = [];
  if (b.title) ctx.push(`Page title: ${b.title}`);
  if (b.url) ctx.push(`URL: ${b.url}`);
  if (!ctx.length) ctx.push("Page context: (none — user typed a standalone task)");
  if (b.selection) ctx.push(`Selected text:\n${b.selection}`);
  if (b.excerpt) ctx.push(`Page excerpt:\n${b.excerpt}`);
  return ctx;
}

/** Shared preamble: persona + workspace charter + saved memory, so the browser shares Pip's brain. */
function preamble(persona: string): string[] {
  const parts = [persona];
  const charter = readCharter(WORKDIR);
  if (charter) parts.push(`--- WORKSPACE CHARTER ---\n${charter}`);
  const memory = readMemory(WORKDIR);
  if (memory) {
    parts.push(
      `--- MEMORY (durable context Pip has saved; use it, and append new durable learnings to memory/) ---\n${memory}`,
    );
  }
  return parts;
}

function buildPrompt(b: AskBody): string {
  const parts = preamble(BROWSER_PERSONA);
  parts.push(`--- PAGE CONTEXT ---\n${pageContext(b).join("\n\n")}`);
  parts.push(`--- QUESTION ---\n${b.question || "Summarize this page and tell me what I should do about it."}`);
  return parts.join("\n\n");
}

function buildAssignPrompt(b: AssignBody): string {
  const parts = preamble(ASSIGN_PERSONA);
  parts.push(`--- PAGE CONTEXT ---\n${pageContext(b).join("\n\n")}`);
  parts.push(`--- TASK ---\n${assignInstruction(b)}`);
  return parts.join("\n\n");
}

function assignInstruction(b: AssignBody): string {
  return b.instruction?.trim() || "Review this page and tell me what I should do about it.";
}

/** A short task title from the instruction (preferred) or page title, capped for the board. */
function deriveTitle(b: AssignBody): string {
  const base = (b.instruction?.trim() || b.title?.trim() || "Review web page").replace(/\s+/g, " ");
  const firstLine = base.split(/[.\n]/)[0]!.trim() || base;
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

const TRUSTED_ORIGIN_PREFIXES = ["chrome-extension://", "moz-extension://"];
const MAX_BODY_BYTES = 1_000_000;

/**
 * The extension popup sends Origin: chrome-extension://<id>. Browsers set Origin themselves and page
 * JavaScript cannot forge it, so this reliably tells our extension apart from any web page — for both
 * cors and no-cors requests (a no-cors POST still carries the page's real Origin).
 */
function isTrustedOrigin(origin: string | undefined): boolean {
  return !!origin && TRUSTED_ORIGIN_PREFIXES.some((p) => origin.startsWith(p));
}

/**
 * Reject requests whose Host isn't loopback. Defeats DNS-rebinding, where a public hostname is
 * repointed at 127.0.0.1 so a web page can reach this local server.
 */
function isLoopbackHost(req: import("node:http").IncomingMessage): boolean {
  const name = (req.headers.host ?? "").toLowerCase().split(":")[0];
  return name === "127.0.0.1" || name === "localhost" || name === "[::1]" || name === "::1";
}

function applyCors(origin: string | undefined, res: import("node:http").ServerResponse): void {
  // Never send a wildcard on a server that can run code. Only ever echo a trusted extension origin.
  if (!isTrustedOrigin(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin!);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

/** Read the request body with a hard size cap so a local client can't exhaust memory. */
function readCappedBody(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<string | null> {
  return new Promise((resolveBody) => {
    let raw = "";
    let aborted = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY_BYTES && !aborted) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
        resolveBody(null);
      }
    });
    req.on("end", () => !aborted && resolveBody(raw));
    req.on("error", () => !aborted && resolveBody(null));
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;

  // Loopback Host only (anti DNS-rebind).
  if (!isLoopbackHost(req)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  // Block any browser context that isn't the Tandem extension. A web page's fetch always carries its
  // real, unforgeable Origin, so this stops both cors and no-cors POSTs to /assign (the RCE vector).
  // Requests with no Origin (curl, local tooling, tests) are allowed on loopback.
  if (origin !== undefined && !isTrustedOrigin(origin)) {
    res.writeHead(403).end("forbidden origin");
    return;
  }

  applyCors(origin, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    const version = await checkCli(CURSOR_BIN);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, cli: version, workspace: WORKDIR, model: MODEL, tasksFile: TASKS_FILE }));
    return;
  }

  if (req.method === "POST" && req.url === "/ask") {
    const raw = await readCappedBody(req, res);
    if (raw === null) return;
    try {
      const body = JSON.parse(raw || "{}") as AskBody;
      const result = await runAgent(
        { cliBin: CURSOR_BIN, model: MODEL, workspace: WORKDIR, timeoutMs: TIMEOUT_MS },
        { prompt: buildPrompt(body), outputFormat: "json" },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: result.text }));
      logActivity(WORKDIR, {
        surface: "browser",
        ask: body.question || `about ${body.title || body.url || "a page"}`,
        outcome: result.text,
      });
    } catch (err) {
      const msg = err instanceof EngineError ? err.message : String((err as Error)?.message ?? err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // Assign a task to Pip: capture it to tasks.md, run the agent now, save the outcome back.
  // This is the one write/full-access path; it is reachable only from the extension (Origin-gated above)
  // and only via the explicit "Assign to Pip" action in the popup.
  if (req.method === "POST" && req.url === "/assign") {
    const raw = await readCappedBody(req, res);
    if (raw === null) return;
    try {
      const body = JSON.parse(raw || "{}") as AssignBody;

      // 1. Deterministic capture into Needs triage — gives us a stable task id immediately.
      const { id } = appendWebTask(TASKS_FILE, {
        title: deriveTitle(body),
        project: body.project,
        priority: body.priority,
        source: body.url,
        page: body.title,
        context: body.selection || body.excerpt,
        nextAction: assignInstruction(body),
        via: "Pip · web",
      });

      // 2. Run the agent now with full tool access (assign is Origin-gated above).
      const result = await runAgent(
        { cliBin: CURSOR_BIN, model: MODEL, workspace: WORKDIR, timeoutMs: TIMEOUT_MS },
        { prompt: buildAssignPrompt(body), outputFormat: "json" },
      );

      // 3. Persist the outcome back onto the same task (Pip's watcher picks it up).
      const outcome = result.text?.trim() || "(no output)";
      appendTaskSubBullet(TASKS_FILE, id, "Outcome", outcome);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ taskId: id, text: outcome, tasksFile: TASKS_FILE }));
      logActivity(WORKDIR, {
        surface: "browser (assign)",
        ask: deriveTitle(body),
        outcome,
      });
    } catch (err) {
      const msg = err instanceof EngineError ? err.message : String((err as Error)?.message ?? err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Pip bridge (Tandem) on http://127.0.0.1:${PORT}`);
  console.log(`Workspace: ${WORKDIR}  ·  Model: ${MODEL}`);
  console.log(`Tasks file: ${TASKS_FILE}`);
  const version = await checkCli(CURSOR_BIN);
  console.log(version ? `Engine: ${version}` : `⚠ ${CURSOR_BIN} not found — install + cursor-agent login`);
});
