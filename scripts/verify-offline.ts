/**
 * Offline verification — no cursor-agent, no tokens needed.
 * Proves the per-endpoint LOGIC is correct: how each surface configures the engine differently,
 * Slack prompt assembly, and mrkdwn conversion. Run: npm run verify
 */
import { buildArgs } from "@tandem/engine";
import { toSlackMrkdwn, chunkText } from "@tandem/core";
import { assemblePrompt } from "../apps/slack/src/prompt.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

console.log("\n[1] Engine argv differs correctly per endpoint\n");

const ws = "/repo";
const slackArgs = buildArgs({ workspace: ws, model: "auto" }, { prompt: "do x", outputFormat: "json" });
check("Slack: json output + --force (does work) + --resume capable", slackArgs.includes("--force") && slackArgs.includes("json"));
const slackResume = buildArgs({ workspace: ws }, { prompt: "p", resumeChatId: "chat_42" });
check("Slack: passes --resume <chatId>", slackResume.includes("--resume") && slackResume.includes("chat_42"));

const groomArgs = buildArgs({ workspace: ws }, { prompt: "groom", outputFormat: "text", mode: "plan" });
check("Clippy groom: read-only --mode plan, NO --force", groomArgs.includes("--mode") && groomArgs.includes("plan") && !groomArgs.includes("--force"));
const captureArgs = buildArgs({ workspace: ws }, { prompt: "capture", outputFormat: "text", force: true });
check("Clippy capture: --force (writes) + text output", captureArgs.includes("--force") && captureArgs.includes("text"));
const screenArgs = buildArgs({ workspace: ws }, { prompt: "screenshot", outputFormat: "text", mode: "ask" });
check("Clippy screenshot: read-only --mode ask", screenArgs.includes("ask") && !screenArgs.includes("--force"));

const chromeArgs = buildArgs({ workspace: ws }, { prompt: "page", outputFormat: "json", mode: "ask" });
check("Chrome: read-only --mode ask (browser is safe)", chromeArgs.includes("ask") && !chromeArgs.includes("--force"));

console.log("\n[2] Slack mrkdwn conversion\n");
const md = "# Heading\n**bold** and [link](https://x.com)\n* item";
const slack = toSlackMrkdwn(md);
check("heading → *bold line*", slack.includes("*Heading*"));
check("**bold** → *bold*", slack.includes("*bold*"));
check("[link](url) → <url|label>", slack.includes("<https://x.com|link>"));
check("* bullet → • bullet", slack.includes("• item"));
const chunks = chunkText("a\n".repeat(3000), 3800);
check("long text chunked under limit", chunks.length > 1 && chunks.every((c) => c.length <= 3800));

console.log("\n[3] Slack prompt assembly\n");
const prompt = assemblePrompt({
  workspace: process.cwd(),
  channelName: "#launch",
  threadHistory: "@U1: when is the demo?\n@U2: this week",
  userId: "U9",
  task: "draft the announcement",
});
check("includes persona (executor voice)", /Tandem/i.test(prompt));
check("includes channel context", prompt.includes("#launch"));
check("includes thread history", prompt.includes("when is the demo?"));
check("includes the task", prompt.includes("draft the announcement"));
check("includes workspace charter (AGENTS.md)", prompt.includes("WORKSPACE CHARTER"));

console.log(`\n${fail === 0 ? "✅" : "❌"} offline checks: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
