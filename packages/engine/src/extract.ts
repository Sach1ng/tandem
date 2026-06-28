/**
 * The cursor-agent JSON shape is not contractually stable across versions, so we
 * read it tolerantly instead of hardcoding field names (see Build Spec pitfall).
 * Always verify against your installed version with: npm run engine:smoke
 */

function stringifyContent(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  // Anthropic-style content blocks: [{ type: "text", text: "..." }, ...]
  if (Array.isArray(value)) {
    return value
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return String((block as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    return JSON.stringify(value);
  }
  return String(value);
}

export interface ExtractedResult {
  text: string;
  chatId: string | null;
  parsed: boolean;
}

/** Pull the final text and a resumable chat id out of cursor-agent stdout. */
export function extractResult(out: string): ExtractedResult {
  const trimmed = out.trim();
  try {
    const o = JSON.parse(trimmed) as Record<string, any>;
    const text =
      o.result ?? o.text ?? o.response ?? o.message?.content ?? o.output ?? "";
    const chatId =
      o.chatId ?? o.chat_id ?? o.session_id ?? o.sessionId ?? o.threadId ?? null;
    return {
      text: stringifyContent(text) || trimmed,
      chatId: chatId != null ? String(chatId) : null,
      parsed: true,
    };
  } catch {
    // stream-json or plain text: hand back the raw stdout, no chat id.
    return { text: trimmed, chatId: null, parsed: false };
  }
}
