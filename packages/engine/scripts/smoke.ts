/**
 * Engine smoke test — step 1 of the build order.
 *
 * Verifies cursor-agent is installed + authed and that extractResult correctly reads
 * the JSON shape your installed version emits. Run before wiring any surface:
 *
 *   npm run engine:smoke
 *   npm run engine:smoke -- --model gpt-5 --workspace .
 */
import { checkCli, runAgent, buildArgs } from "../src/index.ts";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const workspace = arg("workspace", process.cwd());
  const model = arg("model", "auto");
  const cliBin = arg("bin", "cursor-agent");

  console.log("Tandem engine smoke test\n");
  const version = await checkCli(cliBin);
  if (!version) {
    console.error(`✗ ${cliBin} not found.`);
    console.error("  Install:  curl https://cursor.com/install -fsS | bash");
    console.error("  Auth:     cursor-agent login");
    process.exit(1);
  }
  console.log(`✓ CLI found: ${version}`);

  const cfg = { cliBin, model, workspace };
  const opts = { prompt: "Reply with exactly: tandem-ok", outputFormat: "json" as const };
  console.log("→ argv:", [cliBin, ...buildArgs(cfg, opts)].map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" "));

  const result = await runAgent(cfg, opts);
  console.log("\n--- result ---");
  console.log("parsed JSON :", result.parsed);
  console.log("chatId      :", result.chatId ?? "(none — check JSON field names)");
  console.log("durationMs  :", result.durationMs);
  console.log("text        :", JSON.stringify(result.text.slice(0, 200)));

  if (!result.parsed) {
    console.warn("\n⚠ stdout did not parse as JSON. Inspect raw output and adjust extract.ts if needed:");
    console.warn(result.raw.slice(0, 500));
  }
  if (!result.chatId) {
    console.warn("\n⚠ No chat id extracted. Slack thread-resume needs one — inspect the raw JSON:");
    console.warn(result.raw.slice(0, 500));
  }
}

main().catch((err) => {
  console.error("\n✗ smoke test failed:", err?.message ?? err);
  process.exit(2);
});
