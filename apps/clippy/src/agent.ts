import { runAgent } from "@tandem/engine";
import type { ClippyConfig } from "./config.ts";
import {
  isPmQuestion,
  isShortQuestion,
  isTrivialGreeting,
  localGreetingReply,
} from "./agent-session.ts";

/** Absolute path to the task file for use inside prompts (agent cwd may be PM OS). */
function taskFileRef(cfg: ClippyConfig): string {
  return cfg.tasksFile;
}

const groomPrompt = (file: string) => `Read the task file at ${file} (it has four sections: Active, Scheduled, Waiting, Needs triage).
Return ONLY valid JSON (no prose, no code fences) with this exact shape:
{
  "active": ["≤5 one-line summaries of what to focus on today"],
  "suggested_moves": [{"from_section": "...", "line_hint": "...", "to_section": "...", "reason": "..."}],
  "stale": [{"line_hint": "...", "reason": "..."}],
  "summary": "2-sentence BLUF"
}
Rules: Active list ≤5. Only include Scheduled/Waiting items if they are dated or blocked.
Prefer #p0 items. Do not invent tasks that aren't in the file.`;

const capturePrompt = (file: string, text: string) => `Append exactly ONE new task to the "## Needs triage" section of ${file}.
Format: a checkbox line "- [ ] <title> #project/<inferred> #from/self #p<0|1|2>" followed by indented
sub-bullets for Source, Due (if any), and Next action. Infer a sensible project tag and priority.
Do NOT modify, reorder, or reformat any existing tasks. Task to add: "${text.replace(/"/g, '\\"')}"`;

const PM_OS_HINT = (kb: string) =>
  `PM OS: ${kb} — Read/Grep or @paths only if needed for this question.`;

function engineCfg(cfg: ClippyConfig, model?: string) {
  return {
    cliBin: cfg.agent,
    model: model ?? cfg.agentModel,
    workspace: cfg.agentWorkspace,
    timeoutMs: 120_000,
  };
}

function askPrompt(cfg: ClippyConfig, question: string): string {
  const q = question.trim();
  const pm = isPmQuestion(q) ? `\n${PM_OS_HINT(cfg.knowledgeBase)}` : "";
  if (isShortQuestion(q)) {
    return `You are Pip, a concise desktop buddy. Reply in 1–3 sentences.${pm}\n\nQ: ${q}`;
  }
  return `You are Pip, a concise desktop buddy. Lead with the answer.${pm}\n\nQ: ${q}`;
}

function screenshotPrompt(imagePath: string, question: string, kb: string): string {
  const q = question.trim() || "What's on screen? If there's an error, explain the fix.";
  const pm = isPmQuestion(q) ? `\nPM OS (only if relevant): ${kb}` : "";
  return `@${imagePath}\n\n${q}${pm}`;
}

export interface AgentReply {
  text: string;
  chatId: string | null;
  durationMs: number;
}

/** Review the board. Returns the raw model output (expected to be JSON). */
export async function groom(cfg: ClippyConfig): Promise<{ raw: string }> {
  const result = await runAgent(engineCfg(cfg), {
    prompt: groomPrompt(taskFileRef(cfg)),
    outputFormat: "json",
  });
  return { raw: stripFences(result.text) };
}

/** Writes one task into Needs triage. Needs write access, so force is on. */
export async function capture(cfg: ClippyConfig, text: string): Promise<void> {
  await runAgent(engineCfg(cfg, cfg.agentFastModel), {
    prompt: capturePrompt(taskFileRef(cfg), text),
    outputFormat: "json",
    force: true,
  });
}

/** Visual help: analyze a captured screenshot. */
export async function askAboutScreenshot(
  cfg: ClippyConfig,
  imagePath: string,
  question: string,
  opts: { resumeChatId?: string | null } = {},
): Promise<AgentReply> {
  const model = cfg.agentVisionModel?.trim() || cfg.agentFastModel || cfg.agentModel;
  const result = await runAgent(engineCfg(cfg, model), {
    prompt: screenshotPrompt(imagePath, question, cfg.knowledgeBase),
    outputFormat: "json",
    resumeChatId: opts.resumeChatId,
  });
  return { text: result.text, chatId: result.chatId, durationMs: result.durationMs };
}

/** General ask — desktop assistant (no screenshot). */
export async function ask(
  cfg: ClippyConfig,
  question: string,
  opts: { resumeChatId?: string | null } = {},
): Promise<AgentReply> {
  const q = question.trim();
  if (isTrivialGreeting(q)) {
    return { ...localGreetingReply(), chatId: opts.resumeChatId ?? null, durationMs: 0 };
  }
  const model = cfg.agentFastModel?.trim() || cfg.agentModel;
  const result = await runAgent(engineCfg(cfg, model), {
    prompt: askPrompt(cfg, q),
    outputFormat: "json",
    resumeChatId: opts.resumeChatId,
  });
  return { text: result.text, chatId: result.chatId, durationMs: result.durationMs };
}

/** Models sometimes wrap JSON in ``` fences despite instructions — strip them. */
function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
