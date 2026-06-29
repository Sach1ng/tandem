import { createServer } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, checkCli, EngineError } from "@tandem/engine";
import {
  readCharter,
  resolveWorkspace,
  appendWebTask,
  appendTaskSubBullet,
  resolveTasksFile,
} from "@tandem/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const PORT = Number(process.env.TANDEM_BRIDGE_PORT ?? 8765);
const WORKDIR = resolveWorkspace(REPO_ROOT);
const TASKS_FILE = resolveTasksFile(WORKDIR);
const MODEL = process.env.CURSOR_MODEL?.trim() || "auto";
const CURSOR_BIN = process.env.CURSOR_BIN?.trim() || "cursor-agent";

const BROWSER_PERSONA = `You are Lens, Tandem's page-aware browser surface. The user is looking at a web
page and has asked you something about it. Lead with the answer. Be concise and skimmable.
Use the page context provided. If it is a PM artifact (PRD, ticket, dashboard, doc), apply the
relevant PM OS skill from the workspace. Never invent facts; if the page context is insufficient, say so.`;

const ASSIGN_PERSONA = `You are Lens, Tandem's page-aware browser surface, acting on a task the user
just assigned from a web page. Do the task now using the page context provided, then lead with the
result. Be concise and skimmable — this answer is saved to the user's task board and shown on their
desktop. If the page context is insufficient to fully complete the task, do what you can and state
what's missing. Never invent facts.`;

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
  const ctx = [
    `Page title: ${b.title ?? "(unknown)"}`,
    `URL: ${b.url ?? "(unknown)"}`,
  ];
  if (b.selection) ctx.push(`Selected text:\n${b.selection}`);
  if (b.excerpt) ctx.push(`Page excerpt:\n${b.excerpt}`);
  return ctx;
}

function buildPrompt(b: AskBody): string {
  const charter = readCharter(WORKDIR);
  const parts = [BROWSER_PERSONA];
  if (charter) parts.push(`--- WORKSPACE CHARTER ---\n${charter}`);
  parts.push(`--- PAGE CONTEXT ---\n${pageContext(b).join("\n\n")}`);
  parts.push(`--- QUESTION ---\n${b.question || "Summarize this page and tell me what I should do about it."}`);
  return parts.join("\n\n");
}

function buildAssignPrompt(b: AssignBody): string {
  const charter = readCharter(WORKDIR);
  const parts = [ASSIGN_PERSONA];
  if (charter) parts.push(`--- WORKSPACE CHARTER ---\n${charter}`);
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

function cors(res: import("node:http").ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = createServer(async (req, res) => {
  cors(res);
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
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      try {
        const body = JSON.parse(raw || "{}") as AskBody;
        const result = await runAgent(
          { cliBin: CURSOR_BIN, model: MODEL, workspace: WORKDIR, timeoutMs: 300_000 },
          { prompt: buildPrompt(body), outputFormat: "json" },
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: result.text }));
      } catch (err) {
        const msg = err instanceof EngineError ? err.message : String((err as Error)?.message ?? err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  // Assign a task to Pip: capture it to tasks.md, run the agent now, save the outcome back.
  if (req.method === "POST" && req.url === "/assign") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
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
          via: "Lens",
        });

        // 2. Run the agent now with the page context (full tool access).
        const result = await runAgent(
          { cliBin: CURSOR_BIN, model: MODEL, workspace: WORKDIR, timeoutMs: 300_000 },
          { prompt: buildAssignPrompt(body), outputFormat: "json" },
        );

        // 3. Persist the outcome back onto the same task (Clippy's watcher picks it up).
        const outcome = result.text?.trim() || "(no output)";
        appendTaskSubBullet(TASKS_FILE, id, "Outcome", outcome);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ taskId: id, text: outcome, tasksFile: TASKS_FILE }));
      } catch (err) {
        const msg = err instanceof EngineError ? err.message : String((err as Error)?.message ?? err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Lens bridge (Tandem) on http://127.0.0.1:${PORT}`);
  console.log(`Workspace: ${WORKDIR}  ·  Model: ${MODEL}`);
  console.log(`Tasks file: ${TASKS_FILE}`);
  const version = await checkCli(CURSOR_BIN);
  console.log(version ? `Engine: ${version}` : `⚠ ${CURSOR_BIN} not found — install + cursor-agent login`);
});
