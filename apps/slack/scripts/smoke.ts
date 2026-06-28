/**
 * Live Slack smoke — exercises the same agent + reply path as production.
 * (User token only has search scopes, so we don't post as the user.)
 * Run: npm run slack:smoke
 */
import { WebClient } from "@slack/web-api";
import { runAgent } from "@tandem/engine";
import { loadConfig } from "../src/config.ts";
import { assemblePrompt } from "../src/prompt.ts";
import { postReply } from "../src/slack.ts";

const PROMPT = "Reply with exactly: tandem-slack-ok";

async function main() {
  const cfg = loadConfig();
  const bot = new WebClient(cfg.botToken);

  const auth = await bot.auth.test();
  if (!auth.ok) throw new Error("Bot auth failed: " + auth.error);
  console.log(`✓ bot connected: ${auth.user} @ ${auth.team}`);

  const ownerId = cfg.allowedUsers[0];
  if (!ownerId) throw new Error("ALLOWED_USERS is empty");

  const dm = await bot.conversations.open({ users: ownerId });
  const channel = dm.channel?.id;
  if (!channel) throw new Error("Could not open owner DM");

  console.log(`→ running agent (${cfg.model})…`);
  const prompt = assemblePrompt({
    workspace: cfg.workdir,
    channelName: "dm-smoke",
    threadHistory: [],
    userId: ownerId,
    task: PROMPT,
  });

  const result = await runAgent(
    { cliBin: cfg.cursorBin, model: cfg.model, workspace: cfg.workdir, timeoutMs: cfg.maxRuntimeMs },
    { prompt, outputFormat: "json" },
  );

  const text = result.text?.trim() ?? "";
  console.log(`→ agent: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`);

  if (!text.includes("tandem-slack-ok")) {
    throw new Error(`Agent did not return expected text. Got: ${text}`);
  }

  await postReply(bot, channel, String(Date.now() / 1000), `✅ Tandem smoke test passed.\n\n_${text}_`);
  console.log("✓ posted confirmation to your Slack DM");
  console.log("✅ slack smoke PASS");
}

main().catch((err) => {
  console.error("✗ slack smoke failed:", err?.message ?? err);
  process.exit(1);
});
