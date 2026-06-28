import { createServer } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, checkCli, EngineError } from "@tandem/engine";
import { readCharter } from "@tandem/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const PORT = Number(process.env.TANDEM_BRIDGE_PORT ?? 8765);
const WORKDIR = process.env.CURSOR_WORKDIR?.trim() || REPO_ROOT;
const MODEL = process.env.CURSOR_MODEL?.trim() || "auto";
const CURSOR_BIN = process.env.CURSOR_BIN?.trim() || "cursor-agent";

const BROWSER_PERSONA = `You are Tandem, an AI coworker embedded in the user's browser. The user is looking at a web
page and has asked you something about it. Lead with the answer. Be concise and skimmable.
Use the page context provided. If it is a PM artifact (PRD, ticket, dashboard, doc), apply the
relevant PM OS skill from the workspace. Never invent facts; if the page context is insufficient, say so.`;

interface AskBody {
  url?: string;
  title?: string;
  selection?: string;
  excerpt?: string;
  question?: string;
}

function buildPrompt(b: AskBody): string {
  const charter = readCharter(WORKDIR);
  const ctx = [
    `Page title: ${b.title ?? "(unknown)"}`,
    `URL: ${b.url ?? "(unknown)"}`,
  ];
  if (b.selection) ctx.push(`Selected text:\n${b.selection}`);
  if (b.excerpt) ctx.push(`Page excerpt:\n${b.excerpt}`);

  const parts = [BROWSER_PERSONA];
  if (charter) parts.push(`--- WORKSPACE CHARTER ---\n${charter}`);
  parts.push(`--- PAGE CONTEXT ---\n${ctx.join("\n\n")}`);
  parts.push(`--- QUESTION ---\n${b.question || "Summarize this page and tell me what I should do about it."}`);
  return parts.join("\n\n");
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
    res.end(JSON.stringify({ ok: true, cli: version, workspace: WORKDIR, model: MODEL }));
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
          { prompt: buildPrompt(body), outputFormat: "json", mode: "ask" }, // read-only in the browser
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

  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Tandem bridge on http://127.0.0.1:${PORT}`);
  console.log(`Workspace: ${WORKDIR}  ·  Model: ${MODEL}`);
  const version = await checkCli(CURSOR_BIN);
  console.log(version ? `Engine: ${version}` : `⚠ ${CURSOR_BIN} not found — install + cursor-agent login`);
});
