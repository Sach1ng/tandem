/**
 * Install launchd KeepAlive agent so Pip Slack stays always-on across reboots.
 * Run: npm run slack:install-service
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SLACK_DIR = join(__dirname, "..");
const HOME = homedir();
const LAUNCH_AGENTS = join(HOME, "Library", "LaunchAgents");
const PLIST_PATH = join(LAUNCH_AGENTS, "com.tandem.slack.plist");
const LABEL = "com.tandem.slack";

function detectNpm(): string {
  try {
    return execSync("which npm", { encoding: "utf8" }).trim();
  } catch {
    return "npm";
  }
}

function uid(): string {
  return String(process.getuid?.() ?? execSync("id -u", { encoding: "utf8" }).trim());
}

function plistXml(npm: string): string {
  const pathEnv = [
    join(HOME, ".local", "bin"),
    join(HOME, ".local", "node-v22.22.3-darwin-arm64", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${npm}</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${SLACK_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/tandem-slack.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/tandem-slack.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>${pathEnv}</string>
    </dict>
</dict>
</plist>
`;
}

function main(): void {
  const npm = detectNpm();
  mkdirSync(LAUNCH_AGENTS, { recursive: true });
  writeFileSync(PLIST_PATH, plistXml(npm), "utf8");
  console.log(`✓ Wrote ${PLIST_PATH}`);

  const gui = `gui/${uid()}`;
  try {
    execSync(`launchctl bootout ${gui}/${LABEL}`, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
  execSync(`launchctl bootstrap ${gui} "${PLIST_PATH}"`);
  execSync(`launchctl kickstart -k ${gui}/${LABEL}`);
  console.log(`✓ ${LABEL} loaded (KeepAlive + RunAtLoad)`);
  console.log(`  logs: tail -f /tmp/tandem-slack.out.log`);
}

main();
