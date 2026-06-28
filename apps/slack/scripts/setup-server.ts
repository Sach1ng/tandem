/**
 * One-click Slack setup — opens in your browser, validates tokens, writes apps/slack/.env.
 * Run: npm run slack:setup
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebClient } from "@slack/web-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SLACK_DIR = join(__dirname, "..");
const ENV_PATH = join(SLACK_DIR, ".env");
const MANIFEST = readFileSync(join(SLACK_DIR, "manifest.json"), "utf8");
const PORT = Number(process.env.TANDEM_SETUP_PORT ?? 8766);

function htmlPage(manifest: string): string {
  const escaped = manifest.replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tandem — Slack setup</title>
  <style>
    :root { --bg:#0f1117; --card:#1a1d27; --text:#e8eaed; --muted:#9aa0a6; --accent:#6c8cff; --ok:#3dd68c; --err:#ff6b6b; }
    * { box-sizing: border-box; }
    body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--text); }
    main { max-width:720px; margin:0 auto; padding:32px 20px 48px; }
    h1 { font-size:1.5rem; margin:0 0 8px; }
    p { color:var(--muted); margin:0 0 16px; }
    .card { background:var(--card); border:1px solid #2a2f3a; border-radius:12px; padding:20px; margin:16px 0; }
    h2 { font-size:1rem; margin:0 0 12px; }
    ol { margin:0; padding-left:1.25rem; color:var(--muted); }
    ol li { margin:8px 0; }
    a { color:var(--accent); }
    textarea { width:100%; min-height:180px; font:12px/1.4 ui-monospace,monospace; background:#0b0d12; color:var(--text); border:1px solid #2a2f3a; border-radius:8px; padding:12px; resize:vertical; }
    label { display:block; font-size:13px; color:var(--muted); margin:12px 0 6px; }
    input { width:100%; font:14px ui-monospace,monospace; background:#0b0d12; color:var(--text); border:1px solid #2a2f3a; border-radius:8px; padding:10px 12px; }
    button { margin-top:16px; background:var(--accent); color:#fff; border:0; border-radius:8px; padding:12px 18px; font-size:15px; font-weight:600; cursor:pointer; }
    button.secondary { background:#2a2f3a; margin-left:8px; }
    button:disabled { opacity:.5; cursor:not-allowed; }
    .status { margin-top:16px; padding:12px; border-radius:8px; display:none; }
    .status.ok { display:block; background:#14352a; color:var(--ok); }
    .status.err { display:block; background:#3a1a1a; color:var(--err); }
    code { background:#0b0d12; padding:2px 6px; border-radius:4px; font-size:13px; }
  </style>
</head>
<body>
  <main>
    <h1>Tandem Slack setup</h1>
    <p>Paste your tokens below — this page validates them, writes <code>apps/slack/.env</code>, and can start the bot.</p>

    <div class="card">
      <h2>Step 1 — Create the Slack app (if you haven't yet)</h2>
      <ol>
        <li>Open <a href="https://api.slack.com/apps" target="_blank" rel="noopener">api.slack.com/apps</a> → <strong>Create New App</strong> → <strong>From a manifest</strong>.</li>
        <li>Paste the manifest JSON below → create the app.</li>
        <li><strong>Basic Information</strong> → App-Level Tokens → generate <code>socket</code> with <code>connections:write</code> → copy <code>xapp-…</code>.</li>
        <li><strong>Install App</strong> → Install to workspace → copy <code>xoxb-…</code> (bot) and <code>xoxp-…</code> (user, optional).</li>
      </ol>
      <label for="manifest">Manifest JSON (copy this)</label>
      <textarea id="manifest" readonly>${escaped}</textarea>
      <button type="button" class="secondary" onclick="copyManifest()">Copy manifest</button>
    </div>

    <div class="card">
      <h2>Step 2 — Paste tokens</h2>
      <form id="form">
        <label for="bot">Bot User OAuth Token <code>xoxb-…</code></label>
        <input id="bot" name="bot" required placeholder="xoxb-..." autocomplete="off" />
        <label for="app">App-Level Token <code>xapp-…</code> (connections:write)</label>
        <input id="app" name="app" required placeholder="xapp-..." autocomplete="off" />
        <label for="user">User OAuth Token <code>xoxp-…</code> (optional — enables polling fallback)</label>
        <input id="user" name="user" placeholder="xoxp-..." autocomplete="off" />
        <button type="submit" id="save">Save &amp; validate</button>
        <button type="button" class="secondary" id="start" disabled>Start bot</button>
      </form>
      <div id="status" class="status"></div>
    </div>
  </main>
  <script>
    function copyManifest() {
      const t = document.getElementById('manifest');
      t.select();
      navigator.clipboard.writeText(t.value);
      alert('Manifest copied — paste it in Slack app creation.');
    }
    const form = document.getElementById('form');
    const status = document.getElementById('status');
    const startBtn = document.getElementById('start');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'status';
      status.textContent = 'Validating…';
      status.style.display = 'block';
      startBtn.disabled = true;
      const body = {
        bot: document.getElementById('bot').value.trim(),
        app: document.getElementById('app').value.trim(),
        user: document.getElementById('user').value.trim(),
      };
      try {
        const res = await fetch('/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        status.className = 'status ok';
        status.textContent = 'Saved apps/slack/.env — bot: ' + data.botUser + ' · owner: ' + data.ownerId + (data.team ? ' · team: ' + data.team : '');
        startBtn.disabled = false;
      } catch (err) {
        status.className = 'status err';
        status.textContent = err.message || String(err);
      }
    });
    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      status.className = 'status';
      status.textContent = 'Starting bot…';
      try {
        const res = await fetch('/start', { method:'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Start failed');
        status.className = 'status ok';
        status.textContent = data.message;
      } catch (err) {
        status.className = 'status err';
        status.textContent = err.message || String(err);
        startBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

async function validateAndSave(body: { bot: string; app: string; user?: string }) {
  const bot = body.bot?.trim();
  const app = body.app?.trim();
  const user = body.user?.trim();

  if (!bot?.startsWith("xoxb-")) throw new Error("Bot token must start with xoxb-");
  if (!app?.startsWith("xapp-")) throw new Error("App token must start with xapp-");

  const botClient = new WebClient(bot);
  const auth = await botClient.auth.test();
  if (!auth.ok) throw new Error("Bot token invalid: " + (auth.error ?? "auth.test failed"));

  let ownerId = "";
  if (user?.startsWith("xoxp-")) {
    const userClient = new WebClient(user);
    const u = await userClient.auth.test();
    if (!u.ok) throw new Error("User token invalid: " + (u.error ?? "auth.test failed"));
    ownerId = u.user_id ?? "";
  }

  if (!ownerId) {
    throw new Error(
      "User token (xoxp-) is required so we can auto-detect your member ID for ALLOWED_USERS. Copy it from Install App → User OAuth Token.",
    );
  }

  const lines = [
    "# Generated by npm run slack:setup — do not commit",
    `SLACK_BOT_TOKEN=${bot}`,
    `SLACK_APP_TOKEN=${app}`,
    `SLACK_USER_TOKEN=${user}`,
    `ALLOWED_USERS=${ownerId}`,
    "",
    "CURSOR_WORKDIR=",
    "CURSOR_BIN=cursor-agent",
    "CURSOR_MODEL=auto",
    "MAX_RUNTIME_MS=600000",
    "OPEN_THREAD_TTL_MS=72000000",
    "",
  ];
  writeFileSync(ENV_PATH, lines.join("\n"), "utf8");

  return {
    botUser: auth.user ?? "Tandem",
    team: auth.team ?? "",
    ownerId,
  };
}

let botChild: import("node:child_process").ChildProcess | null = null;

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlPage(MANIFEST));
    return;
  }

  if (req.method === "POST" && url === "/save") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      const body = JSON.parse(raw) as { bot: string; app: string; user?: string };
      const result = await validateAndSave(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message ?? String(err) }));
    }
    return;
  }

  if (req.method === "POST" && url === "/start") {
    try {
      if (botChild && !botChild.killed) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, message: "Bot already running in this setup session." }));
        return;
      }
      const { spawn } = await import("node:child_process");
      botChild = spawn("npm", ["start"], {
        cwd: SLACK_DIR,
        env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
        stdio: "inherit",
        detached: false,
      });
      botChild.on("exit", () => {
        botChild = null;
      });
      await new Promise((r) => setTimeout(r, 2500));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          message: "Bot started. In Slack: create #tandem-test, /invite @Tandem, then @Tandem say hi.",
        }),
      );
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message ?? String(err) }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const setupUrl = `http://127.0.0.1:${PORT}`;
  console.log(`\nTandem Slack setup → ${setupUrl}\n`);
  console.log("Paste your Slack tokens in the browser. This writes apps/slack/.env and can start the bot.\n");
  import("node:child_process").then(({ execFile }) => {
    execFile("open", [setupUrl], () => {});
  });
});
