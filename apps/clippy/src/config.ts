import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

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
  corner: "top-right" | "bottom-right";
  margin: number;
}

export interface ClippyConfig {
  workspace: string; // absolute
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
 * Merge config.default.json with an optional (gitignored) config.json, then resolve paths.
 * `workspace: "."` means the Tandem repo root, so the agent inherits AGENTS.md + the PM OS submodule.
 */
export function loadConfig(appDir: string, repoRoot: string): ClippyConfig {
  const defaults = readJson(join(appDir, "config.default.json"));
  const user = readJson(join(appDir, "config.json"));
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

  const workspace = !merged.workspace || merged.workspace === "."
    ? repoRoot
    : isAbsolute(merged.workspace)
      ? merged.workspace
      : resolve(repoRoot, merged.workspace);

  const tasksFile = isAbsolute(merged.tasksFile)
    ? merged.tasksFile
    : resolve(workspace, merged.tasksFile);

  return {
    workspace,
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
      autoAsk: merged.hotkey?.autoAsk !== false,
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
