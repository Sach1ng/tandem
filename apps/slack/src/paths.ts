import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { resolveWorkspace } from "@tandem/core";

declare global {
  // Set by dist/app.cjs banner when bundled; else derived from import.meta.url (tsx dev).
  var __TANDEM_SLACK_PKG_DIR: string | undefined;
}

function resolveSlackPkgDir(): string {
  if (globalThis.__TANDEM_SLACK_PKG_DIR) return globalThis.__TANDEM_SLACK_PKG_DIR;
  if (typeof import.meta !== "undefined" && import.meta.url) {
    return resolve(dirname(fileURLToPath(import.meta.url)), "..");
  }
  throw new Error("Cannot resolve @tandem/slack package directory");
}

export const SLACK_PKG_DIR = resolveSlackPkgDir();
export const REPO_ROOT = resolve(SLACK_PKG_DIR, "../..");

/** Directory for Slack tokens and config (.env, installation.json). */
export function slackConfigDir(): string {
  const fromEnv = process.env.TANDEM_SLACK_CONFIG_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);

  const wsSlack = join(resolveWorkspace(REPO_ROOT), "slack");
  if (existsSync(join(wsSlack, ".env")) || existsSync(join(wsSlack, "installation.json"))) {
    return wsSlack;
  }

  // Legacy monorepo dev path (apps/slack/.env)
  const devEnv = join(SLACK_PKG_DIR, ".env");
  if (existsSync(devEnv)) return SLACK_PKG_DIR;

  mkdirSync(wsSlack, { recursive: true });
  return wsSlack;
}

export function slackEnvPath(): string {
  return join(slackConfigDir(), ".env");
}

export function slackInstallationPath(): string {
  return join(slackConfigDir(), "installation.json");
}
