#!/usr/bin/env node
/**
 * Start the Tandem Slack coworker (loads config from ~/.tandem/slack/.env).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const slackRoot = resolve(__dirname, "..");
const app = join(slackRoot, "dist", "app.cjs");

if (!existsSync(app)) {
  console.error("@tandem/slack is not built. Run npm run build in apps/slack.");
  process.exit(1);
}

const child = spawn(process.execPath, [app], {
  stdio: "inherit",
  env: { ...process.env, TANDEM_SLACK_PKG_DIR: slackRoot },
  cwd: slackRoot,
});
child.on("exit", (code) => process.exit(code ?? 0));
