import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { resolveWorkspace } from "@tandem/core";

export interface ClippyHotkeyConfig {
  /** Electron accelerator, e.g. Command+Shift+T. null = disabled. */
  snip: string | null;
  /** When true, the hotkey captures then immediately asks the agent (no extra click). */
  autoAsk: boolean;
  /** Question sent with autoAsk. */
  question: string;
}

export interface ClippyNudgeConfig {
  enabled: boolean;
  /** System idle (no mouse/keyboard) before the orb pulses. */
  idleSeconds: number;
  /** Min time between nudges. */
  cooldownSeconds: number;
}

export interface ClippyVoiceConfig {
  enabled: boolean;
  /** Submit as soon as speech is recognized. */
  autoSend: boolean;
  /** Read answers aloud (macOS TTS). */
  speakReplies: boolean;
}

export interface ClippyPlacementConfig {
  corner: "top-center" | "top-right" | "bottom-right";
  margin: number;
}

export interface ClippyConfig {
  workspace: string; // absolute — tasks, screenshots, local config
  agentWorkspace: string; // absolute — cursor-agent --workspace (PM OS or Tandem root)
  knowledgeBase: string; // absolute — PM OS brain directory
  tasksFile: string; // absolute
  agent: string;
  agentModel: string;
  agentFlags: string[];
  panel: { minW: number; minH: number; maxW: number; maxH: number; defaultW: number; defaultH: number; compactH?: number; tallH?: number; snipH?: number };
  collapsed: { w: number; h: number };
  placement: ClippyPlacementConfig;
  hotkey: ClippyHotkeyConfig;
  nudge: ClippyNudgeConfig;
  voice: ClippyVoiceConfig;
}

function readJson(path: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Merge config.default.json with optional config.json, then resolve paths.
 *
 * Workspace resolution (in priority order):
 *  1. TANDEM_WORKSPACE / CURSOR_WORKDIR env (via resolveWorkspace)
 *  2. config.json workspace field ("." = resolved default)
 *  3. repoRoot fallback when developing from a git checkout
 *
 * Config file lookup: appDir/config.json first, then ~/.tandem/config.json.
 */
export function loadConfig(appDir: string, repoRoot: string): ClippyConfig {
  const defaults = readJson(join(appDir, "config.default.json"));
  const userApp = readJson(join(appDir, "config.json"));
  const userHome = readJson(join(homedir(), ".tandem", "config.json"));
  const user = { ...userHome, ...userApp };
  const merged: Record<string, any> = {
    ...defaults,
    ...user,
    panel: { ...defaults.panel, ...user.panel },
    collapsed: { ...defaults.collapsed, ...user.collapsed },
    placement: { ...defaults.placement, ...user.placement },
    hotkey: { ...defaults.hotkey, ...user.hotkey },
    nudge: { ...defaults.nudge, ...user.nudge },
    voice: { ...defaults.voice, ...user.voice },
  };

  const defaultWs = resolveWorkspace(repoRoot);
  const workspace = !merged.workspace || merged.workspace === "."
    ? defaultWs
    : isAbsolute(merged.workspace)
      ? merged.workspace
      : resolve(defaultWs, merged.workspace);

  const tasksFile = isAbsolute(merged.tasksFile)
    ? merged.tasksFile
    : resolve(workspace, merged.tasksFile);

  const knowledgeBaseRaw = merged.knowledgeBase?.trim();
  const knowledgeBase = knowledgeBaseRaw
    ? isAbsolute(knowledgeBaseRaw)
      ? knowledgeBaseRaw
      : resolve(workspace, knowledgeBaseRaw)
    : "";

  return {
    workspace,
    agentWorkspace: workspace, // finalized in main after ensureKnowledgeBase
    knowledgeBase,
    tasksFile,
    agent: merged.agent ?? "cursor-agent",
    agentModel: merged.agentModel ?? "auto",
    agentFlags: merged.agentFlags ?? ["-p", "--trust", "--output-format", "text"],
    panel: merged.panel,
    collapsed: merged.collapsed,
    placement: {
      corner: merged.placement?.corner === "bottom-right" ? "bottom-right" : "top-right",
      margin: Number(merged.placement?.margin ?? 16),
    },
    hotkey: {
      snip: merged.hotkey?.snip ?? "Command+Shift+T",
      autoAsk: merged.hotkey?.autoAsk === true,
      question:
        merged.hotkey?.question?.trim() ||
        "What's on my screen? If there's an error, tell me how to fix it.",
    },
    nudge: {
      enabled: merged.nudge?.enabled !== false,
      idleSeconds: Number(merged.nudge?.idleSeconds ?? 120),
      cooldownSeconds: Number(merged.nudge?.cooldownSeconds ?? 600),
    },
    voice: {
      enabled: merged.voice?.enabled !== false,
      autoSend: merged.voice?.autoSend !== false,
      speakReplies: Boolean(merged.voice?.speakReplies),
    },
  };
}
