/**
 * Live screenshot/vision smoke — needs cursor-agent logged in.
 * Captures a tiny region (top-left menu bar sliver, privacy-safe) and asks the agent to read it,
 * verifying whether the selected model can actually view images. Run: npm run pip:screenshot-smoke
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { askAboutScreenshot } from "../src/agent.ts";
import type { PipConfig } from "../src/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function capture(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("screencapture", ["-R", "0,0,240,60", "-x", file], () => resolve(existsSync(file)));
  });
}

async function main() {
  const dir = join(REPO_ROOT, ".tandem");
  mkdirSync(dir, { recursive: true });

  // Use an explicit image if provided (TEST_IMG=/path), else try a live screen capture.
  let file = process.env.TEST_IMG || "";
  if (file) {
    if (!existsSync(file)) {
      console.error(`✗ TEST_IMG not found: ${file}`);
      process.exit(1);
    }
    console.log(`→ using provided image: ${file}\n→ asking the agent to read it…\n`);
  } else {
    file = join(dir, "vision-smoke.png");
    console.log("→ capturing a 240×60 sliver of the screen…");
    if (!(await capture(file))) {
      console.error("✗ screencapture produced no file (grant Screen Recording permission, or pass TEST_IMG=/path/to.png)");
      process.exit(1);
    }
    console.log(`  saved ${file}\n→ asking the agent to read it…\n`);
  }

  const kb =
    process.env.TANDEM_KNOWLEDGE_BASE || join(REPO_ROOT, "external", "pm-operating-os");
  const cfg: PipConfig = {
    workspace: REPO_ROOT,
    agentWorkspace: kb,
    knowledgeBase: kb,
    tasksFile: join(REPO_ROOT, "tasks.example.md"),
    agent: "cursor-agent",
    agentModel: process.env.CURSOR_MODEL || "auto",
    agentFastModel: process.env.CURSOR_FAST_MODEL || "composer-2.5-fast",
    agentVisionModel: process.env.CURSOR_VISION_MODEL || process.env.CURSOR_FAST_MODEL || "composer-2.5-fast",
    agentFlags: ["-p", "--trust", "--output-format", "text"],
    models: ["composer-2.5-fast", "auto"],
    panel: { minW: 320, minH: 360, maxW: 560, maxH: 820, defaultW: 400, defaultH: 560 },
    collapsed: { w: 96, h: 110 },
    placement: { corner: "top-right", margin: 16, snapThreshold: 64 },
    peek: { enabled: false, idleSeconds: 25, insetPct: 0.62 },
    hotkey: { snip: "Command+Shift+T", summon: null, hide: null, autoAsk: false, question: "What's on my screen?" },
    personality: { motion: false, gaze: false, greet: false, celebrate: false, sleepy: false, sleepyIdleSeconds: 45 },
    nudge: { enabled: false, idleSeconds: 120, cooldownSeconds: 600 },
    voice: { enabled: false, autoSend: true, speakReplies: false },
    monitor: { enabled: false, port: 8791 },
  };

  const { text } = await askAboutScreenshot(cfg, file, "List any text, menu items, or icons you can see in this image.");
  console.log("--- agent ---\n" + text + "\n");

  const sawImage = !/can'?t (see|view|read)|unable to (see|view)|no image|cannot (see|view)/i.test(text);
  console.log(sawImage ? "✅ vision works — the model read the image" : "⚠ the model could not view the image (try a vision-capable --model)");
}

main().catch((err) => {
  console.error("✗ failed:", err?.message ?? err);
  process.exit(2);
});
