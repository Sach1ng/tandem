import { runAgent } from "@tandem/engine";
import type { ClippyConfig } from "./config.ts";

const GROOM_PROMPT = `Read tasks.md (it has four sections: Active, Scheduled, Waiting, Needs triage).
Return ONLY valid JSON (no prose, no code fences) with this exact shape:
{
  "active": ["≤5 one-line summaries of what to focus on today"],
  "suggested_moves": [{"from_section": "...", "line_hint": "...", "to_section": "...", "reason": "..."}],
  "stale": [{"line_hint": "...", "reason": "..."}],
  "summary": "2-sentence BLUF"
}
Rules: Active list ≤5. Only include Scheduled/Waiting items if they are dated or blocked.
Prefer #p0 items. Do not invent tasks that aren't in the file.`;

const capturePrompt = (text: string) => `Append exactly ONE new task to the "## Needs triage" section of tasks.md.
Format: a checkbox line "- [ ] <title> #project/<inferred> #from/self #p<0|1|2>" followed by indented
sub-bullets for Source, Due (if any), and Next action. Infer a sensible project tag and priority.
Do NOT modify, reorder, or reformat any existing tasks. Task to add: "${text.replace(/"/g, '\\"')}"`;

function engineCfg(cfg: ClippyConfig) {
  return { cliBin: cfg.agent, model: cfg.agentModel, workspace: cfg.workspace, timeoutMs: 180_000 };
}

/** Read-only review of the board. Returns the raw model output (expected to be JSON). */
export async function groom(cfg: ClippyConfig): Promise<{ raw: string }> {
  const result = await runAgent(engineCfg(cfg), {
    prompt: GROOM_PROMPT,
    outputFormat: "text",
    mode: "plan", // read-only — a "safe" groom
  });
  return { raw: stripFences(result.text) };
}

/** Writes one task into Needs triage. Needs write access, so force is on. */
export async function capture(cfg: ClippyConfig, text: string): Promise<void> {
  await runAgent(engineCfg(cfg), {
    prompt: capturePrompt(text),
    outputFormat: "text",
    force: true,
  });
}

/** Models sometimes wrap JSON in ``` fences despite instructions — strip them. */
function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
