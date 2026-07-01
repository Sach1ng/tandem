import boltPkg from "@slack/bolt";
import webApiPkg from "@slack/web-api";
import { KeyedQueue, logActivity } from "@tandem/core";
import { EngineError, runAgent, checkCli } from "@tandem/engine";
import { loadConfig } from "./config.ts";
import { AccessGate, parseAccessCommand } from "./access.ts";
import { OpenThreadStore, ProcessedStore, SessionStore, threadKey } from "./state.ts";
import { assemblePrompt } from "./prompt.ts";
import {
  fetchThreadHistory,
  getBotUserId,
  getChannelName,
  postReply,
  removeBotMention,
} from "./slack.ts";
import { startPolling } from "./poller.ts";
import type { NormalizedMessage, Ctx } from "./types.ts";

const { App, LogLevel } = boltPkg;
const { WebClient } = webApiPkg;

async function processMessage(m: NormalizedMessage, ctx: Ctx): Promise<void> {
  const { botUserId, gate, processed, queue, botClient } = ctx;

  // Self-loop guard FIRST — covers socket + both pollers (Build Spec pitfall #2).
  if (!m.user || m.user === botUserId) return;
  if (processed.has(m.ts)) return;

  const isDM = m.channelType === "im";
  const mentioned = m.text.includes(`<@${botUserId}>`);
  if (!isDM && !mentioned) return;

  // Single markHandled point so socket + poll never double-deliver.
  processed.markHandled(m.ts);

  const threadTs = m.threadTs || m.ts;
  const key = threadKey(m.channel, threadTs);
  const cleanText = removeBotMention(m.text, botUserId);

  // Owner-only access commands.
  const cmd = parseAccessCommand(cleanText);
  if (cmd) {
    if (!gate.isOwner(m.user)) {
      await postReply(botClient, m.channel, threadTs, ":lock: Only the owner can open or close this thread.");
      return;
    }
    if (cmd === "open") {
      gate.open(m.channel, threadTs);
      await postReply(botClient, m.channel, threadTs, ":unlock: This thread is open — anyone here can tag me now.");
    } else {
      gate.close(m.channel, threadTs);
      await postReply(botClient, m.channel, threadTs, ":lock: This thread is closed to non-owners.");
    }
    return;
  }

  if (!gate.canRun(m.user, m.channel, threadTs)) {
    await postReply(
      botClient,
      m.channel,
      threadTs,
      ":no_entry: I only take tasks from my owner here. The owner can say `open thread` to let everyone in.",
    );
    return;
  }

  if (!cleanText) return; // bare mention, nothing to do

  // Serialize per thread so follow-ups don't race the session file.
  await queue.run(key, () => runTask(m, threadTs, key, cleanText, ctx));
}

async function runTask(
  m: NormalizedMessage,
  threadTs: string,
  key: string,
  task: string,
  ctx: Ctx,
): Promise<void> {
  const { botClient, cfg, sessions } = ctx;

  let ackTs: string | undefined;
  try {
    const ack = await botClient.chat.postMessage({ channel: m.channel, thread_ts: threadTs, text: ":eyes: On it…" });
    ackTs = ack.ts as string | undefined;
  } catch {
    /* acking is best-effort */
  }

  const clearAck = async () => {
    if (ackTs) await botClient.chat.delete({ channel: m.channel, ts: ackTs }).catch(() => {});
  };

  try {
    const [channelName, history] = await Promise.all([
      getChannelName(botClient, m.channel),
      fetchThreadHistory(botClient, m.channel, threadTs, m.ts),
    ]);

    const prompt = assemblePrompt({
      workspace: cfg.workdir,
      channelName,
      threadHistory: history,
      userId: m.user,
      task,
    });

    const result = await runAgent(
      {
        cliBin: cfg.cursorBin,
        model: cfg.model,
        workspace: cfg.workdir,
        timeoutMs: cfg.maxRuntimeMs,
      },
      { prompt, resumeChatId: sessions.getChatId(key), outputFormat: "json" },
    );

    if (result.chatId) sessions.setChatId(key, result.chatId);
    await clearAck();
    await postReply(botClient, m.channel, threadTs, result.text || "_(the agent returned no output)_");
    logActivity(cfg.workdir, { surface: "slack", ask: task, outcome: result.text });
  } catch (err) {
    const msg = err instanceof EngineError ? err.message : String((err as Error)?.message ?? err);
    console.error(`[task] ${key} failed:`, msg);
    await clearAck();
    await postReply(botClient, m.channel, threadTs, `:x: Task failed: ${msg}`);
  }
}

async function main() {
  const cfg = loadConfig();

  const botClient = new WebClient(cfg.botToken);
  const userClient = cfg.userToken ? new WebClient(cfg.userToken) : null;

  const botUserId = await getBotUserId(botClient);
  console.log(`Tandem Slack coworker starting as ${botUserId}`);
  console.log(`Workspace: ${cfg.workdir}`);
  console.log(`Model: ${cfg.model} via ${cfg.cursorBin}`);
  console.log(`Owners: ${cfg.allowedUsers.length ? cfg.allowedUsers.join(", ") : "(anyone — set ALLOWED_USERS!)"}`);

  const version = await checkCli(cfg.cursorBin);
  if (!version) {
    console.warn(
      `⚠ ${cfg.cursorBin} not found on PATH. Tasks will fail until you run: curl https://cursor.com/install -fsS | bash && cursor-agent login`,
    );
  } else {
    console.log(`Engine: ${version}`);
  }

  const ctx: Ctx = {
    cfg,
    botUserId,
    botClient,
    userClient,
    processed: new ProcessedStore(),
    sessions: new SessionStore(),
    gate: new AccessGate(cfg, new OpenThreadStore()),
    queue: new KeyedQueue(),
    bootTs: Date.now() / 1000,
  };

  const app = new App({
    token: cfg.botToken,
    appToken: cfg.appToken,
    socketMode: true,
    logLevel: LogLevel.INFO,
  });

  app.event("message", async ({ event }) => {
    const e = event as Record<string, any>;
    if (e.subtype || e.bot_id || !e.user) return; // skip edits, bot posts, system messages
    await processMessage(
      {
        channel: e.channel,
        ts: e.ts,
        threadTs: e.thread_ts,
        user: e.user,
        text: String(e.text ?? ""),
        channelType: e.channel_type,
        source: "socket",
      },
      ctx,
    ).catch((err) => console.error("[socket] handler error:", err));
  });

  await app.start();
  console.log("⚡ Socket Mode connected.");

  startPolling(ctx, (m) => processMessage(m, ctx));
}

process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1); // let launchd/KeepAlive restart us clean
});

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
