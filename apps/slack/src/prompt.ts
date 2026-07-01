import { join } from "node:path";
import { readCharter, readPersona } from "@tandem/core";
import { SLACK_PKG_DIR } from "./paths.ts";

const PERSONA_PATH = join(SLACK_PKG_DIR, "persona.md");

/** Hardcoded fallback so the bot still has a voice if persona.md is missing. */
const PERSONA_FALLBACK =
  "You are Pip, Tandem's AI coworker in Slack. Lead with the answer, act end-to-end, cite workspace " +
  "files, never invent facts, and reply in Slack mrkdwn (*bold*, _italic_, `code`, <url|label>; no # headings, no tables).";

export interface PromptInput {
  workspace: string;
  channelName: string;
  threadHistory: string;
  userId: string;
  task: string;
}

/**
 * Assemble the full prompt. cursor-agent has no --system-prompt, so persona + charter are
 * prepended into the prompt string (and also auto-loaded from AGENTS.md). Read fresh each run.
 */
export function assemblePrompt(input: PromptInput): string {
  const persona = readPersona(PERSONA_PATH, PERSONA_FALLBACK);
  const charter = readCharter(input.workspace);

  const parts = [persona];
  if (charter) parts.push(`--- WORKSPACE CHARTER ---\n${charter}`);

  const context = [`Slack channel: ${input.channelName} (infer the project from this)`];
  if (input.threadHistory) context.push(`Thread so far:\n${input.threadHistory}`);
  parts.push(`--- CONTEXT ---\n${context.join("\n\n")}`);

  parts.push(`--- TASK (from @${input.userId}) ---\n${input.task}`);

  return parts.join("\n\n");
}
