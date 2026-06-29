/**
 * Offline verification — no cursor-agent, no tokens needed.
 * Proves the per-endpoint LOGIC is correct: how each surface configures the engine differently,
 * Slack prompt assembly, mrkdwn conversion, and ecosystem naming. Run: npm run verify
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildArgs } from "@tandem/engine";
import { toSlackMrkdwn, chunkText } from "@tandem/core";
import { assemblePrompt } from "../apps/slack/src/prompt.ts";

const ROOT = join(import.meta.dirname, "..");

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

const groomArgs = buildArgs({ workspace: ws }, { prompt: "groom", outputFormat: "text" });
check("Clippy groom: --force (full tool access)", groomArgs.includes("--force") && !groomArgs.includes("--mode"));
const captureArgs = buildArgs({ workspace: ws }, { prompt: "capture", outputFormat: "text", force: true });
check("Clippy capture: --force + text output", captureArgs.includes("--force") && captureArgs.includes("text"));
const screenArgs = buildArgs({ workspace: ws }, { prompt: "screenshot", outputFormat: "text" });
check("Clippy screenshot: --force (full tool access)", screenArgs.includes("--force") && !screenArgs.includes("--mode"));

const chromeArgs = buildArgs({ workspace: ws }, { prompt: "page", outputFormat: "json" });
check("Chrome Lens: --force (full tool access)", chromeArgs.includes("--force") && !chromeArgs.includes("--mode"));

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

console.log("\n[4] Ecosystem naming (repo manifests & personas)\n");

const slackManifest = JSON.parse(readFileSync(join(ROOT, "apps/slack/manifest.json"), "utf8"));
check("Slack app name: Tandem", slackManifest.display_information?.name === "Tandem");
check("Slack bot display_name: Tandem", slackManifest.features?.bot_user?.display_name === "Tandem");
check("Slack manifest mentions Pip + Lens", /Pip/.test(slackManifest.display_information?.long_description ?? ""));

const chromeManifest = JSON.parse(readFileSync(join(ROOT, "apps/chrome-extension/public/manifest.json"), "utf8"));
check("Chrome extension name: Tandem Lens", chromeManifest.name === "Tandem Lens");
check("Chrome short_name: Lens", chromeManifest.short_name === "Lens");

const chromePopup = readFileSync(join(ROOT, "apps/chrome-extension/public/popup.html"), "utf8");
check("Chrome popup brand: Lens", chromePopup.includes(">Lens<"));
check("Chrome popup: by Tandem", chromePopup.includes("by Tandem"));
check("Chrome popup CTA: Ask Lens", chromePopup.includes("Ask Lens"));

const chromeBridge = readFileSync(join(ROOT, "apps/chrome-extension/bridge/server.ts"), "utf8");
check("Lens bridge persona", /You are Lens, Tandem's page-aware browser surface/.test(chromeBridge));

const pipAgent = readFileSync(join(ROOT, "apps/clippy/src/agent.ts"), "utf8");
check("Pip assistant persona", /You are Pip/.test(pipAgent));
check("Pip screenshot @-path prompt", /@\$\{imagePath\}/.test(pipAgent));

const pipHtml = readFileSync(join(ROOT, "apps/clippy/ui/index.html"), "utf8");
check("Pip UI title", pipHtml.includes("Pip · Tandem"));
check("Pip placeholder", pipHtml.includes("Ask Pip"));

const clippyConfig = JSON.parse(readFileSync(join(ROOT, "apps/clippy/config.default.json"), "utf8"));
check("Pip placement: top-right", clippyConfig.placement?.corner === "top-right");

console.log(`\n${fail === 0 ? "✅" : "❌"} offline checks: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
