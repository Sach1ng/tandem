/**
 * Offline verification — no cursor-agent, no tokens needed.
 * Proves the per-endpoint LOGIC is correct: how each surface configures the engine differently,
 * Slack prompt assembly, mrkdwn conversion, and ecosystem naming. Run: npm run verify
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgs } from "@tandem/engine";
import {
  chunkText,
  ensureBrainScaffold,
  hasBrainSkills,
  logActivity,
  readMemory,
  resolveKnowledgeBase,
  toSlackMrkdwn,
} from "@tandem/core";
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
check("Pip groom: --force (full tool access)", groomArgs.includes("--force") && !groomArgs.includes("--mode"));
const captureArgs = buildArgs({ workspace: ws }, { prompt: "capture", outputFormat: "text", force: true });
check("Pip capture: --force + text output", captureArgs.includes("--force") && captureArgs.includes("text"));
const screenArgs = buildArgs({ workspace: ws }, { prompt: "screenshot", outputFormat: "text" });
check("Pip screenshot: --force (full tool access)", screenArgs.includes("--force") && !screenArgs.includes("--mode"));

const chromeAskArgs = buildArgs({ workspace: ws }, { prompt: "page", outputFormat: "json" });
check("Chrome Pip /ask: --force (full tool access)", chromeAskArgs.includes("--force") && !chromeAskArgs.includes("--mode"));

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
check("Slack app name: Pip", slackManifest.display_information?.name === "Pip");
check("Slack bot display_name: Pip", slackManifest.features?.bot_user?.display_name === "Pip");
check("Slack manifest mentions Pip", /Pip/.test(slackManifest.display_information?.long_description ?? ""));

const chromeManifest = JSON.parse(readFileSync(join(ROOT, "apps/chrome-extension/public/manifest.json"), "utf8"));
check("Chrome extension name: Tandem Pip", chromeManifest.name === "Tandem Pip");
check("Chrome short_name: Pip", chromeManifest.short_name === "Pip");

const chromePopup = readFileSync(join(ROOT, "apps/chrome-extension/public/popup.html"), "utf8");
check("Chrome popup brand: Pip", chromePopup.includes(">Pip<"));
check("Chrome popup: by Tandem", chromePopup.includes("by Tandem"));
check("Chrome popup CTA: Ask Pip", chromePopup.includes("Ask Pip"));

const chromeBridge = readFileSync(join(ROOT, "apps/chrome-extension/bridge/server.ts"), "utf8");
check("Pip bridge persona", /You are Pip, Tandem's page-aware browser surface/.test(chromeBridge));
check("Pip bridge autonomy charter", /PIP_AGENT_AUTONOMY|WebSearch/.test(chromeBridge));
check("Pip bridge configurable timeout", /TIMEOUT_MS/.test(chromeBridge));

const pipAgent = readFileSync(join(ROOT, "apps/pip/src/agent.ts"), "utf8");
check("Pip assistant persona", /You are Pip/.test(pipAgent));
check("Pip desktop web browse", /WebSearch/.test(pipAgent));
check("Pip screenshot @-path prompt", /@\$\{imagePath\}/.test(pipAgent));

const pipHtml = readFileSync(join(ROOT, "apps/pip/ui/index.html"), "utf8");
check("Pip UI title", pipHtml.includes("Pip · Tandem"));
check("Pip placeholder", pipHtml.includes("Ask Pip"));

const pipConfig = JSON.parse(readFileSync(join(ROOT, "apps/pip/config.default.json"), "utf8"));
check("Pip placement: bottom-right", pipConfig.placement?.corner === "bottom-right");

console.log("\n[5] Zero-context / grow-as-you-go (PM OS optional)\n");

const tmp = mkdtempSync(join(tmpdir(), "tandem-brain-"));
try {
  // A brand-new workspace has no PM OS skills — that must be fine, not an error.
  check("empty workspace: no PM OS skills detected", hasBrainSkills(tmp) === false);
  check("empty workspace: resolveKnowledgeBase doesn't throw / returns none", resolveKnowledgeBase(tmp) === undefined);
  check("empty workspace: memory is empty", readMemory(tmp) === "");

  // Seeding creates a self-growing memory scaffold.
  const created = ensureBrainScaffold(tmp);
  check("scaffold creates memory/profile.md", created.some((p) => p.endsWith("profile.md")) && existsSync(join(tmp, "memory", "profile.md")));
  check("scaffold is idempotent", ensureBrainScaffold(tmp).length === 0);

  // Seed-only memory injects nothing (no placeholder noise), but real notes do.
  check("seed-only memory injects nothing", readMemory(tmp) === "");
  writeFileSync(join(tmp, "memory", "profile.md"), "# Profile\n\nUser ships on Fridays.\n");
  const mem = readMemory(tmp);
  check("learned memory is injected", mem.includes("ships on Fridays"));

  // Cross-surface memory: any surface's activity is logged and flows back into every surface's context.
  logActivity(tmp, { surface: "slack", ask: "draft the launch note", outcome: "posted the draft" });
  logActivity(tmp, { surface: "desktop", ask: "what did I just do?", outcome: "recapped it" });
  const activity = readFileSync(join(tmp, "memory", "activity.md"), "utf8");
  check("activity log records the surface", activity.includes("slack") && activity.includes("desktop"));
  check("activity log records the ask", activity.includes("draft the launch note"));
  const memWithActivity = readMemory(tmp);
  check("activity flows back into shared context", memWithActivity.includes("draft the launch note"));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("\n[6] Presence config (peek / magnetic snap / hide)\n");
check("peek-when-idle disabled by default (GPU stability)", pipConfig.peek?.enabled === false);
check("peek leaves a visible sliver (insetPct < 1)", Number(pipConfig.peek?.insetPct) > 0 && Number(pipConfig.peek?.insetPct) < 1);
check("magnetic snap threshold configured", Number(pipConfig.placement?.snapThreshold) > 0);
check("hide/show hotkey configured", typeof pipConfig.hotkey?.hide === "string" && pipConfig.hotkey.hide.length > 0);

console.log(`\n${fail === 0 ? "✅" : "❌"} offline checks: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
