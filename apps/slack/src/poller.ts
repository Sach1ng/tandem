import type { Ctx, NormalizedMessage } from "./types.ts";

const SEARCH_INTERVAL_MS = 15_000;
const DM_INTERVAL_MS = 60_000;

type Handle = (m: NormalizedMessage) => Promise<void>;

function threadTsFromPermalink(permalink?: string): string | undefined {
  if (!permalink) return undefined;
  const m = /thread_ts=([0-9.]+)/.exec(permalink);
  return m?.[1];
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
        console.error("[poll:search]", (err as Error)?.message ?? err);
      }
    };
    setInterval(searchTick, SEARCH_INTERVAL_MS);
    console.log(`Polling fallback: search.messages every ${SEARCH_INTERVAL_MS / 1000}s`);
  } else {
    console.log("Polling fallback: search disabled (no SLACK_USER_TOKEN)");
  }

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
