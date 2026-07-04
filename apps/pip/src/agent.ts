import { runAgent, runAgentStream } from "@tandem/engine";
import { hasBrainSkills, PIP_AGENT_AUTONOMY, readMemory } from "@tandem/core";
import type { PipConfig } from "./config.ts";
import {
  isPmQuestion,
  isShortQuestion,
  isTrivialGreeting,
  localGreetingReply,
} from "./agent-session.ts";

/** Absolute path to the task file for use inside prompts (agent cwd may be PM OS). */
function taskFileRef(cfg: PipConfig): string {
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

/** Fold saved memory into a prompt so context compounds across sessions. "" when nothing learned yet. */
function memoryContext(cfg: PipConfig): string {
  const mem = readMemory(cfg.workspace);
  if (!mem) return "";
  return `\n\n--- MEMORY (yours; use it, and append durable learnings to memory/) ---\n${mem}`;
}

function engineCfg(cfg: PipConfig, model?: string) {
  return {
    cliBin: cfg.agent,
    model: model ?? cfg.agentModel,
    workspace: cfg.agentWorkspace,
    timeoutMs: 120_000,
  };
}

function askPrompt(cfg: PipConfig, question: string): string {
  const q = question.trim();
  const usePmHint = isPmQuestion(q) && hasBrainSkills(cfg.workspace, cfg.knowledgeBase);
  const pm = usePmHint ? `\n${PM_OS_HINT(cfg.knowledgeBase)}` : "";
  const mem = memoryContext(cfg);
  const style = isShortQuestion(q) ? "Reply in 1–3 sentences." : "Lead with the answer.";
  return `You are Pip, Tandem's desktop coworker. ${style} Be concise.
If context is thin or the question needs current external info, use WebSearch and WebFetch to finish anyway — state assumptions briefly.

${PIP_AGENT_AUTONOMY}${pm}${mem}

Q: ${q}`;
}

function screenshotPrompt(cfg: PipConfig, imagePath: string, question: string): string {
  const q = question.trim() || "What's on screen? If there's an error, explain the fix.";
  const usePmHint = isPmQuestion(q) && hasBrainSkills(cfg.workspace, cfg.knowledgeBase);
  const pm = usePmHint ? `\nPM OS (only if relevant): ${cfg.knowledgeBase}` : "";
  return `@${imagePath}

${q}${pm}
If the screenshot isn't enough, use WebSearch and WebFetch for docs or fixes — state assumptions briefly.

${PIP_AGENT_AUTONOMY}`;
}

export interface AgentReply {
  text: string;
  chatId: string | null;
  durationMs: number;
}

/** Review the board. Returns the raw model output (expected to be JSON). */
export async function groom(cfg: PipConfig): Promise<{ raw: string }> {
  const result = await runAgent(engineCfg(cfg), {
    prompt: groomPrompt(taskFileRef(cfg)),
    outputFormat: "json",
  });
  return { raw: stripFences(result.text) };
}

/** Writes one task into Needs triage. Needs write access, so force is on. */
export async function capture(cfg: PipConfig, text: string): Promise<void> {
  await runAgent(engineCfg(cfg, cfg.agentFastModel), {
    prompt: capturePrompt(taskFileRef(cfg), text),
    outputFormat: "json",
    force: true,
  });
}

/** Visual help: analyze a captured screenshot. */
export async function askAboutScreenshot(
  cfg: PipConfig,
  imagePath: string,
  question: string,
  opts: { resumeChatId?: string | null } = {},
): Promise<AgentReply> {
  const model = cfg.agentVisionModel?.trim() || cfg.agentFastModel || cfg.agentModel;
  const result = await runAgent(engineCfg(cfg, model), {
    prompt: screenshotPrompt(cfg, imagePath, question),
    outputFormat: "json",
    resumeChatId: opts.resumeChatId,
  });
  return { text: result.text, chatId: result.chatId, durationMs: result.durationMs };
}

/** General ask — desktop assistant (no screenshot). */
export async function ask(
  cfg: PipConfig,
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

/**
 * Streaming variant of {@link ask}. Same prompt/model/session, but text is
 * emitted via `onDelta` as the model produces it so the answer appears live
 * instead of after the full round-trip. Resolves with the final reply.
 */
export async function askStream(
  cfg: PipConfig,
  question: string,
  onDelta: (delta: string) => void,
  opts: { resumeChatId?: string | null; model?: string | null } = {},
): Promise<AgentReply> {
  const q = question.trim();
  if (isTrivialGreeting(q)) {
    const reply = localGreetingReply();
    onDelta(reply.text);
    return { ...reply, chatId: opts.resumeChatId ?? null, durationMs: 0 };
  }
  const model = opts.model?.trim() || cfg.agentFastModel?.trim() || cfg.agentModel;
  const result = await runAgentStream(
    engineCfg(cfg, model),
    { prompt: askPrompt(cfg, q), resumeChatId: opts.resumeChatId },
    onDelta,
  );
  return { text: result.text, chatId: result.chatId, durationMs: result.durationMs };
}

/** Models sometimes wrap JSON in ``` fences despite instructions — strip them. */
function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
