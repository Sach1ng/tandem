import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TRIVIAL = /^(hi|hello|hey|yo|howdy|sup|thanks|thank you|thx|ok|okay|cheers|gm|good morning|good afternoon|good evening)[\s!.?]*$/i;

const LOCAL_REPLIES = [
  "Hey! I'm Pip — ask me anything, or press ⌘⇧T to snip your screen.",
  "Hi there! What can I help with?",
  "Hey! Ready when you are — type a question or snip something on screen.",
];

export function isTrivialGreeting(text: string): boolean {
  return TRIVIAL.test(text.trim());
}

export function localGreetingReply(): { text: string } {
  const text = LOCAL_REPLIES[Math.floor(Math.random() * LOCAL_REPLIES.length)]!;
  return { text };
}

function chatIdPath(workspace: string): string {
  return join(workspace, ".tandem", "pip-chat-id.txt");
}

export function loadPipChatId(workspace: string): string | null {
  try {
    const id = readFileSync(chatIdPath(workspace), "utf8").trim();
    return id || null;
  } catch {
    return null;
  }
}

export function savePipChatId(workspace: string, chatId: string): void {
  const dir = join(workspace, ".tandem");
  mkdirSync(dir, { recursive: true });
  writeFileSync(chatIdPath(workspace), `${chatId}\n`);
}

/** Reuse saved chat when present; only create a new session on first run. */
export async function warmAgentSession(
  cliBin: string,
  existingId?: string | null,
): Promise<string | null> {
  if (existingId?.trim()) return existingId.trim();
  try {
    const { stdout } = await execFileAsync(cliBin, ["create-chat"], { timeout: 15_000 });
    const id = stdout.trim().split("\n").pop()?.trim();
    return id && id.length > 8 ? id : null;
  } catch {
    return null;
  }
}

export function isShortQuestion(text: string): boolean {
  return text.trim().length <= 80;
}

const PM_TOPIC =
  /\b(prd|strategy|roadmap|launch|metric|okr|kpi|positioning|segment|priorit|triage|groom|exec update|decision|pm os|skill|knowledge base)\b/i;

export function isPmQuestion(text: string): boolean {
  return PM_TOPIC.test(text);
}
