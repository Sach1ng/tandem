import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { resolveWorkspace } from "@tandem/core";

export interface PipHotkeyConfig {
  /** Electron accelerator, e.g. Command+Shift+T. null = disabled. */
  snip: string | null;
  /** Global hotkey that warps Pip next to the cursor. null = disabled. */
  summon: string | null;
  /** Global hotkey that hides/shows Pip (meeting/screen-share safety). null = disabled. */
  hide: string | null;
  /** Global hotkey that summons Pip and starts voice input. null = disabled. */
  voice: string | null;
  /** When true, the hotkey captures then immediately asks the agent (no extra click). */
  autoAsk: boolean;
  /** Question sent with autoAsk. */
  question: string;
}

export interface PipPersonalityConfig {
  /** Master switch for idle motion (breathing, float, gaze). Honors prefers-reduced-motion too. */
  motion: boolean;
  /** Eyes follow the cursor when awake. */
  gaze: boolean;
  /** Wave hello on first appearance. */
  greet: boolean;
  /** Sparkle + bounce when a reply lands. */
  celebrate: boolean;
  /** Droop + "z" after prolonged inactivity. */
  sleepy: boolean;
  /** Seconds of no interaction before Pip looks sleepy. */
  sleepyIdleSeconds: number;
}

export interface PipNudgeConfig {
  enabled: boolean;
  /** System idle (no mouse/keyboard) before Pip pulses. */
  idleSeconds: number;
  /** Min time between nudges. */
  cooldownSeconds: number;
}

export interface PipVoiceConfig {
  enabled: boolean;
  /** Submit as soon as speech is recognized. */
  autoSend: boolean;
  /** Read answers aloud (macOS TTS). */
  speakReplies: boolean;
}

export interface PipPlacementConfig {
  corner: "top-center" | "top-right" | "bottom-right";
  margin: number;
  /** Drop-within-this-many px of an edge to magnetically snap Pip flush to it. */
  snapThreshold: number;
}

export interface PipPeekConfig {
  /** When idle, slide Pip mostly off the nearest edge, leaving a peeking sliver. */
  enabled: boolean;
  /** Seconds of system idle before Pip peeks away. */
  idleSeconds: number;
  /** Fraction of Pip hidden past the edge (0..0.9). 0.62 leaves ~38% showing. */
  insetPct: number;
}

export interface PipConfig {
  workspace: string; // absolute — tasks, screenshots, local config
  agentWorkspace: string; // absolute — cursor-agent --workspace (PM OS or Pip root)
  knowledgeBase: string; // absolute — PM OS brain directory
  tasksFile: string; // absolute
  agent: string;
  agentModel: string;
  /** Faster model for short text asks (e.g. composer-2.5-fast). Screenshots still use agentModel. */
  agentFastModel: string;
  /** Vision/screenshot model — defaults to agentFastModel. */
  agentVisionModel: string;
  /** Selectable models exposed in the runtime switcher (model-agnostic, made visible). */
  models: string[];
  agentFlags: string[];
  panel: { minW: number; minH: number; maxW: number; maxH: number; defaultW: number; defaultH: number; compactH?: number; tallH?: number; snipH?: number };
  collapsed: { w: number; h: number };
  placement: PipPlacementConfig;
  peek: PipPeekConfig;
  hotkey: PipHotkeyConfig;
  personality: PipPersonalityConfig;
  nudge: PipNudgeConfig;
  voice: PipVoiceConfig;
  monitor: PipMonitorConfig;
  ui: PipUiConfig;
}

export interface PipMonitorConfig {
  enabled: boolean;
  port: number;
}

export interface PipUiConfig {
  /** Show Pip in the macOS Dock / Windows taskbar. Default false (ambient floating widget). */
  showInDock: boolean;
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
export function loadConfig(appDir: string, repoRoot: string): PipConfig {
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
    peek: { ...defaults.peek, ...user.peek },
    hotkey: { ...defaults.hotkey, ...user.hotkey },
    personality: { ...defaults.personality, ...user.personality },
    nudge: { ...defaults.nudge, ...user.nudge },
    voice: { ...defaults.voice, ...user.voice },
    monitor: { ...defaults.monitor, ...user.monitor },
    ui: { ...defaults.ui, ...user.ui },
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
    agentFastModel: merged.agentFastModel ?? "composer-2.5-fast",
    agentVisionModel: merged.agentVisionModel ?? merged.agentFastModel ?? "composer-2.5-fast",
    models:
      Array.isArray(merged.models) && merged.models.length
        ? merged.models.map(String)
        : ["composer-2.5-fast", "auto", "gpt-5", "sonnet-4.5"],
    agentFlags: merged.agentFlags ?? ["-p", "--trust", "--output-format", "text"],
    panel: merged.panel,
    collapsed: merged.collapsed,
    placement: {
      corner: merged.placement?.corner === "bottom-right" ? "bottom-right" : "top-right",
      margin: Number(merged.placement?.margin ?? 16),
      snapThreshold: Number(merged.placement?.snapThreshold ?? 64),
    },
    peek: {
      enabled: merged.peek?.enabled !== false,
      idleSeconds: Number(merged.peek?.idleSeconds ?? 25),
      insetPct: Math.max(0, Math.min(0.9, Number(merged.peek?.insetPct ?? 0.62))),
    },
    hotkey: {
      snip: merged.hotkey?.snip ?? "Command+Shift+T",
      summon:
        merged.hotkey?.summon === null ? null : merged.hotkey?.summon ?? "Command+Shift+Space",
      hide: merged.hotkey?.hide === null ? null : merged.hotkey?.hide ?? "Command+Shift+H",
      voice: merged.hotkey?.voice === null ? null : merged.hotkey?.voice ?? "Command+N",
      autoAsk: merged.hotkey?.autoAsk === true,
      question:
        merged.hotkey?.question?.trim() ||
        "What's on my screen? If there's an error, tell me how to fix it.",
    },
    personality: {
      motion: merged.personality?.motion !== false,
      gaze: merged.personality?.gaze !== false,
      greet: merged.personality?.greet !== false,
      celebrate: merged.personality?.celebrate !== false,
      sleepy: merged.personality?.sleepy !== false,
      sleepyIdleSeconds: Number(merged.personality?.sleepyIdleSeconds ?? 45),
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
    monitor: {
      enabled: merged.monitor?.enabled !== false,
      port: Number(merged.monitor?.port ?? 8791),
    },
    ui: {
      showInDock: merged.ui?.showInDock === true,
    },
  };
}
