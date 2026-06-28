/**
 * Best-effort GitHub-flavored Markdown → Slack mrkdwn. Slack does not render `#`
 * headings, `**bold**`, or tables, so we down-convert the common cases.
 */
export function toSlackMrkdwn(md: string): string {
  let out = md;

  // Fenced code blocks: keep content, drop the language tag, normalize to ``` fences.
  out = out.replace(/```[a-zA-Z0-9]*\n/g, "```\n");

  // Headings (#, ##, ### …) → bold line.
  out = out.replace(/^#{1,6}\s+(.*)$/gm, "*$1*");

  // Bold: **x** or __x__ → *x*
  out = out.replace(/\*\*(.+?)\*\*/g, "*$1*");
  out = out.replace(/__(.+?)__/g, "*$1*");

  // Italics: single * already means bold in Slack; convert markdown _x_ stays _x_ (Slack italic).
  // Links: [label](url) → <url|label>
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>");

  // Bullets: normalize "* " / "+ " to "• "; leave "- " (Slack shows it fine).
  out = out.replace(/^(\s*)[*+]\s+/gm, "$1• ");

  return out;
}

const DEFAULT_CHUNK = 3800;

/** Split a long message into Slack-safe chunks, preferring newline boundaries. */
export function chunkText(text: string, max = DEFAULT_CHUNK): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (buf.length + line.length + 1 > max) {
      if (buf) chunks.push(buf);
      if (line.length > max) {
        // A single very long line: hard-split it.
        for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
        buf = "";
      } else {
        buf = line;
      }
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
