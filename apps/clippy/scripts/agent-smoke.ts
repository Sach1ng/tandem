/**
 * Live Clippy agent smoke — needs cursor-agent installed + logged in.
 * Exercises groom (read-only) and capture (write) against a throwaway copy of tasks, so it never
 * touches your real board. Run from repo root: npm run clippy:agent-smoke
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCli } from "@tandem/engine";
import { capture, groom } from "../src/agent.ts";
import type { ClippyConfig } from "../src/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

async function main() {
  const version = await checkCli();
  if (!version) {
    console.error("✗ cursor-agent not found. Install + run: cursor-agent login");
    process.exit(1);
  }
  console.log(`Engine: ${version}\n`);

  const dir = join(REPO_ROOT, ".tandem");
  mkdirSync(dir, { recursive: true });
  const testFile = join(dir, "test-tasks.md");
  copyFileSync(join(REPO_ROOT, "tasks.example.md"), testFile);

  const cfg: ClippyConfig = {
    workspace: REPO_ROOT,
    tasksFile: testFile,
    agent: "cursor-agent",
    agentModel: process.env.CURSOR_MODEL || "auto",
    agentFlags: ["-p", "--trust", "--output-format", "text"],
    panel: { minW: 320, minH: 360, maxW: 560, maxH: 820, defaultW: 400, defaultH: 560 },
    collapsed: { w: 96, h: 110 },
  };

  console.log("→ groom (read-only)…");
  const { raw } = await groom(cfg);
  let groomOk = false;
  try {
    const data = JSON.parse(raw);
    groomOk = Array.isArray(data.active) && typeof data.summary === "string";
    console.log("  summary:", data.summary);
    console.log("  focus  :", (data.active ?? []).slice(0, 3));
  } catch {
    console.log("  ⚠ groom did not return parseable JSON:\n", raw.slice(0, 300));
  }
  console.log(`  groom → ${groomOk ? "PASS" : "CHECK"}\n`);

  const marker = `Smoke check ${Date.now()}`;
  console.log(`→ capture ("${marker}")…`);
  const before = readFileSync(testFile, "utf8");
  await capture(cfg, marker);
  const after = readFileSync(testFile, "utf8");
  const added = after.includes(marker) && after.length > before.length;
  console.log(`  capture → ${added ? "PASS (task appended)" : "CHECK (no new task found)"}\n`);

  console.log(`Done. Test file: ${testFile}`);
}

main().catch((err) => {
  console.error("✗ failed:", err?.message ?? err);
  process.exit(2);
});
