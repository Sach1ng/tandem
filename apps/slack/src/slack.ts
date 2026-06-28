import type { WebClient } from "@slack/web-api";
import { chunkText, toSlackMrkdwn } from "@tandem/core";

/** Replace <@U123> mentions with readable @user tokens for prompt context. */
export function stripMentions(text: string): string {
  return text.replace(/<@([A-Z0-9]+)>/g, "@$1").trim();
}

/** Remove a specific bot mention from the triggering message text. */
export function removeBotMention(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
}

export async function getBotUserId(client: WebClient): Promise<string> {
  const res = await client.auth.test();
  return res.user_id as string;
}

export async function getChannelName(client: WebClient, channel: string): Promise<string> {
  try {
    const res = await client.conversations.info({ channel });
    const c = res.channel as { name?: string; is_im?: boolean } | undefined;
    if (c?.is_im) return "direct message";
    return c?.name ? `#${c.name}` : channel;
  } catch {
    return channel;
  }
}

/**
 * Full thread history, paginated, mentions stripped, formatted as "@user: text".
 * Excludes the triggering message so the model doesn't echo the request back.
 */
export async function fetchThreadHistory(
  client: WebClient,
  channel: string,
  threadTs: string,
  excludeTs: string,
): Promise<string> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 200,
      cursor,
    });
    for (const m of (res.messages ?? []) as Array<Record<string, any>>) {
      if (m.ts === excludeTs) continue;
      if (m.subtype || !m.user) continue;
      const who = m.user as string;
      const what = stripMentions(String(m.text ?? ""));
      if (what) lines.push(`@${who}: ${what}`);
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return lines.join("\n");
}

/** Post a reply in-thread, converting to mrkdwn and chunking to Slack limits. */
export async function postReply(
  client: WebClient,
  channel: string,
  threadTs: string,
  text: string,
): Promise<void> {
  const body = toSlackMrkdwn(text);
  for (const chunk of chunkText(body)) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: chunk,
      unfurl_links: false,
      unfurl_media: false,
    });
  }
}
