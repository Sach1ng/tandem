# Tandem

**An ambient AI coworker that lives where you work.** Tandem takes a capability OS you own —
[PM OS](https://github.com/hardiktiwari/PM-operating-OS) — out of the IDE and into Slack, your screen,
and your browser. It's powered by the **Cursor CLI**, so the same coworker runs on *any* model.

> One brain. Many surfaces. Your models, your machine, your context.

---

## The idea

Most "AI in your tools" products are a model wrapped in a chat box, locked to one vendor and one
surface. Tandem flips that:

1. **The brain is something you own and version.** PM OS is a self-serve Cursor/Codex setup full of
   PM skills, domain knowledge, and compounding memory. Tandem mounts it as a git submodule and runs
   every request *inside* it — so the coworker already knows your strategy, your metrics, and how you
   write PRDs.
2. **The engine is model-agnostic.** Every surface shells out to one shared adapter around
   `cursor-agent`. Switch from `gpt-5` to `sonnet-4` to `auto` with an env var — no new integration.
3. **The surfaces meet you where you already are.** A Slack teammate, a floating desktop task widget,
   and a browser extension all call the *same* engine against the *same* workspace.

```
┌──────────────────────────────────────────────────────────────────┐
│  SURFACES                                                          │
│   Slack · Tandem        Pip (desktop)           Lens (Chrome)   │
│   tag @Tandem           buddy orb               page-aware Q&A  │
└─────────┬──────────────────────┬──────────────────────┬───────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│  ENGINE  ·  packages/engine  ·  one adapter around the Cursor CLI  │
│  runAgent() → cursor-agent -p … --model <any> --workspace <repo>   │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  BRAIN  ·  external/pm-operating-os (git submodule)                │
│  skills · knowledge · memory · MCP tools — loaded via AGENTS.md    │
└──────────────────────────────────────────────────────────────────┘
```

---

## The three surfaces

| Surface | Name | What it does | Where |
|---|---|---|---|
| **Slack** | **Tandem** (`@Tandem`) | Tag or DM your team's coworker. Runs `cursor-agent` in the workspace, replies in-thread. | `apps/slack` |
| **Desktop** | **Pip** | Buddy orb on your screen. Click to ask; **⌘⇧T** to snip and get an answer. | `apps/clippy` |
| **Browser** | **Lens** | Page-aware prompts about whatever tab you're on, via a local bridge to the engine. | `apps/chrome-extension` |

All three import `@tandem/engine`. One product (**Tandem**), three surface personalities, one brain (**PM OS**).

---

## Quickstart

**Prerequisites**
- Node ≥ 20.6
- The **Cursor CLI**: `curl https://cursor.com/install -fsS | bash`, then `cursor-agent login`

```bash
# 1. Clone with the PM OS submodule
git clone --recurse-submodules https://github.com/Sach1ng/tandem.git
cd tandem
# (already cloned? run: git submodule update --init --recursive)

# 2. Install
npm install

# 3. Verify the engine + inspect the CLI's JSON shape
npm run engine:smoke
```

Then start a surface:

```bash
# Slack
cd apps/slack && cp .env.example .env   # fill tokens + ALLOWED_USERS
npm start

# Clippy (macOS)
npm run clippy

# Chrome extension: build it, run the bridge, load dist/ as an unpacked extension
npm run chrome:build
npm run bridge -w @tandem/chrome-extension
```

Per-surface setup lives in each app's README.

---

## Why the Cursor CLI (the "any model" bit)

The engine is a thin, well-tested wrapper around `cursor-agent`:

```ts
import { runAgent } from "@tandem/engine";

const { text, chatId } = await runAgent(
  { model: "auto", workspace: repoRoot },           // ← swap models freely
  { prompt, resumeChatId, outputFormat: "json" },   // ← chatId enables thread resume
);
```

Two deliberate design choices, both from hard-won experience:
- **No `--system-prompt`.** `cursor-agent` doesn't have one, so persona/charter is delivered via the
  prepended prompt *and* the auto-loaded `AGENTS.md` + `.cursor/rules`.
- **Tolerant result parsing.** The CLI's JSON shape isn't contractually stable, so `extractResult`
  reads it defensively across versions. `npm run engine:smoke` shows you exactly what your version emits.

---

## How Tandem differs from a single-vendor Slack bot

|  | Single-vendor Slack AI | **Tandem** |
|---|---|---|
| Models | One vendor's models | **Any** model the Cursor CLI supports |
| Surfaces | Slack only | **Slack + desktop + browser**, one shared engine |
| Brain / memory | Closed, hosted | **PM OS you own + version** (a git submodule) |
| Hosting | Vendor cloud | **Your machine**, local-first |
| Access | Enterprise-gated | **Open source**, works solo |

---

## Repo layout

```
packages/
  engine/   Cursor CLI adapter — runAgent, extractResult, resume, smoke test
  core/     shared utils — Slack mrkdwn, atomic JSON state, charter loader
apps/
  slack/             Bolt coworker (Socket Mode + polling fallback)
  clippy/            Electron task widget (tasks.md contract, parser, groom/capture)
  chrome-extension/  MV3 extension + local bridge server
external/
  pm-operating-os/   PM OS — the brain (git submodule)
AGENTS.md            workspace charter, auto-loaded by the engine on every run
```

---

## Security

`cursor-agent --force` lets the agent run shell on your machine — that's how it gets work done, and
it's remote code execution by design. So:
- **Always set `ALLOWED_USERS`** in the Slack app. Empty = anyone in the channel can run commands.
- The browser bridge runs the agent in **read-only `ask` mode** and binds to `127.0.0.1` only.
- `.env` and all runtime state (`sessions.json`, `processed.json`, `open-threads.json`) are gitignored.

---

## Status

All four surfaces are live-tested against a local `cursor-agent`:

```bash
npm run verify              # 16 offline checks
npm run engine:smoke        # CLI + JSON parse
npm run slack:smoke         # agent + Slack DM reply
npm run clippy:agent-smoke  # groom + capture
npm run clippy:screenshot-smoke  # vision (set TEST_IMG=… if no Screen Recording)
```

Slack setup wizard: `npm run slack:setup` → http://127.0.0.1:8766

Roadmap: ambient/proactive nudges, scheduled tasks, and more surfaces.

## Credits

Co-created by [Sachin Gupta (@Sach1ng)](https://github.com/Sach1ng) and
[Hardik Tiwari (@hardiktiwari)](https://github.com/hardiktiwari).

Stands on [PM OS](https://github.com/hardiktiwari/PM-operating-OS) and the
[Cursor CLI](https://cursor.com/docs/cli).

*Personal project. Not affiliated with or endorsed by any employer or vendor.*

## License

MIT — see [LICENSE](LICENSE).
