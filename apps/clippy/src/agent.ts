import { relative } from "node:path";
import { runAgent } from "@tandem/engine";
import type { ClippyConfig } from "./config.ts";

/** Path to the task file, relative to the agent's workspace, for use inside prompts. */
function taskFileRef(cfg: ClippyConfig): string {
  return relative(cfg.workspace, cfg.tasksFile) || cfg.tasksFile;
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

const SCREEN_PERSONA = `You are Tandem's on-screen helper. The user has captured a screenshot of part of their screen
and wants help with what's in it — often a bug, error message, stack trace, log, or UI state.
Open and view the image file at the path given, then lead with the answer. If it's an error, explain
the likely cause and the concrete fix. Be specific and skimmable. If you genuinely cannot view the
image, say so plainly instead of guessing.`;

function engineCfg(cfg: ClippyConfig) {
  return { cliBin: cfg.agent, model: cfg.agentModel, workspace: cfg.workspace, timeoutMs: 180_000 };
}

/** Read-only review of the board. Returns the raw model output (expected to be JSON). */
export async function groom(cfg: ClippyConfig): Promise<{ raw: string }> {
  const result = await runAgent(engineCfg(cfg), {
    prompt: groomPrompt(taskFileRef(cfg)),
    outputFormat: "text",
    mode: "plan", // read-only — a "safe" groom
  });
  return { raw: stripFences(result.text) };
}

/** Writes one task into Needs triage. Needs write access, so force is on. */
export async function capture(cfg: ClippyConfig, text: string): Promise<void> {
  await runAgent(engineCfg(cfg), {
    prompt: capturePrompt(taskFileRef(cfg), text),
    outputFormat: "text",
    force: true,
  });
}

/**
 * Visual help: analyze a captured screenshot. Read-only (`ask` mode) — the agent only needs to
 * view the image file, never write or run shell.
 */
export async function askAboutScreenshot(
  cfg: ClippyConfig,
  imagePath: string,
  question: string,
): Promise<{ text: string }> {
  const prompt = [
    SCREEN_PERSONA,
    `--- SCREENSHOT ---\nView the image at this absolute path and analyze what it shows:\n${imagePath}`,
    `--- QUESTION ---\n${question?.trim() || "What's on my screen? If there's an error, tell me how to fix it."}`,
  ].join("\n\n");
  const result = await runAgent(engineCfg(cfg), { prompt, outputFormat: "text", mode: "ask" });
  return { text: result.text };
}

/** Models sometimes wrap JSON in ``` fences despite instructions — strip them. */
function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
