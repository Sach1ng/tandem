import type { Ctx, NormalizedMessage } from "./types.ts";

const SEARCH_INTERVAL_MS = 15_000;
const DM_INTERVAL_MS = 60_000;
const CHANNEL_INTERVAL_SOCKET_MS = 60_000;
const CHANNEL_INTERVAL_FALLBACK_MS = 1_500;
const STARTUP_LOOKBACK_SEC = 600;

type Handle = (m: NormalizedMessage) => Promise<void>;

function threadTsFromPermalink(permalink?: string): string | undefined {
  if (!permalink) return undefined;
  const m = /thread_ts=([0-9.]+)/.exec(permalink);
  return m?.[1];
}

/** Scan channels the bot is in for @mentions (works when Socket Mode is off or flaky). */
function startChannelPolling(ctx: Ctx, handle: Handle): void {
  const { botClient, botUserId, bootTs } = ctx;
  let pollSince = bootTs - STARTUP_LOOKBACK_SEC;

  const channelTick = async () => {
    const oldest = String(pollSince);
    try {
      let cursor: string | undefined;
      do {
        const list = await botClient.conversations.list({
          types: "public_channel,private_channel",
          exclude_archived: true,
          limit: 200,
          cursor,
        });
        for (const ch of list.channels ?? []) {
          const channelId = ch.id as string | undefined;
          if (!channelId || !ch.is_member) continue;
          try {
            const hist = await botClient.conversations.history({ channel: channelId, oldest, limit: 50 });
            for (const msg of (hist.messages ?? []) as Array<Record<string, any>>) {
              if (msg.subtype || msg.bot_id || !msg.user) continue;
              if (msg.user === botUserId) continue;
              const text = String(msg.text ?? "");
              if (!text.includes(`<@${botUserId}>`)) continue;
              await handle({
                channel: channelId,
                ts: msg.ts,
                threadTs: msg.thread_ts,
                user: msg.user,
                text,
                channelType: ch.is_private ? "group" : "channel",
                source: "channel-poll",
              });
            }
          } catch {
            /* not_in_channel, etc. */
          }
        }
        cursor = list.response_metadata?.next_cursor || undefined;
      } while (cursor);
      pollSince = Date.now() / 1000 - 3;
    } catch (err) {
      console.error("[poll:channels]", (err as Error)?.message ?? err);
    }
  };

  void channelTick();
  const intervalMs = ctx.socketModeOn ? CHANNEL_INTERVAL_SOCKET_MS : CHANNEL_INTERVAL_FALLBACK_MS;
  setInterval(channelTick, intervalMs);
  console.log(
    `Polling fallback: channel history every ${intervalMs / 1000}s` +
      (ctx.socketModeOn ? " (socket mode primary)" : " (socket mode off — fast poll)"),
  );
}

/**
 * Resilience fallback for missed Socket Mode events. Everything here funnels through the
 * same processMessage (dedupe + self-guard), so a message handled by the socket is never
 * re-run. Requires SLACK_USER_TOKEN for search; DM poll uses the bot token.
 */
export function startPolling(ctx: Ctx, handle: Handle): void {
  const { userClient, botClient, botUserId, cfg, bootTs } = ctx;

  // search.messages — recover @mentions the socket may have dropped.
  if (userClient) {
    const searchTick = async () => {
      try {
        const res = await userClient.search.messages({
          query: `<@${botUserId}>`,
          sort: "timestamp",
          sort_dir: "desc",
          count: 20,
        });
        for (const match of (res.messages?.matches ?? []) as Array<Record<string, any>>) {
          if (!match.ts || Number(match.ts) < bootTs) continue;
          if (match.user === botUserId) continue;
          await handle({
            channel: match.channel?.id ?? match.channel,
            ts: match.ts,
            threadTs: threadTsFromPermalink(match.permalink) ?? match.ts,
            user: match.user,
            text: String(match.text ?? ""),
            channelType: "channel",
            source: "search",
          });
        }
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        if (msg.includes("token_revoked") || msg.includes("invalid_auth")) {
          console.error("[poll:search] user token invalid — re-paste xoxp- in npm run slack:setup");
        } else {
          console.error("[poll:search]", msg);
        }
      }
    };
    setInterval(searchTick, SEARCH_INTERVAL_MS);
    console.log(`Polling fallback: search.messages every ${SEARCH_INTERVAL_MS / 1000}s`);
  } else {
    console.log("Polling fallback: search disabled (no SLACK_USER_TOKEN)");
  }

  startChannelPolling(ctx, handle);

  // DM poll — only meaningful when owners are explicit.
  if (cfg.allowedUsers.length) {
    const dmTick = async () => {
      for (const userId of cfg.allowedUsers) {
        try {
          const open = await botClient.conversations.open({ users: userId });
          const channel = (open.channel as { id?: string })?.id;
          if (!channel) continue;
          const hist = await botClient.conversations.history({ channel, oldest: String(bootTs), limit: 20 });
          for (const msg of (hist.messages ?? []) as Array<Record<string, any>>) {
            if (msg.subtype || msg.bot_id || !msg.user) continue;
            if (msg.user === botUserId) continue;
            await handle({
              channel,
              ts: msg.ts,
              threadTs: msg.thread_ts,
              user: msg.user,
              text: String(msg.text ?? ""),
              channelType: "im",
              source: "dm-poll",
            });
          }
        } catch (err) {
          console.error("[poll:dm]", (err as Error)?.message ?? err);
        }
      }
    };
    setInterval(dmTick, DM_INTERVAL_MS);
    console.log(`Polling fallback: DM history every ${DM_INTERVAL_MS / 1000}s`);
  }
}
