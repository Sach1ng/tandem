# Architecture

Tandem is three layers: **surfaces** (where you interact), an **engine** (one adapter around the
Cursor CLI), and a **brain** (the PM OS submodule the agent runs inside). The value is the seam
between them: every surface is thin, the engine is shared, and the brain is swappable.

## Request lifecycle

A request from any surface follows the same path:

```
surface event ─▶ build prompt (persona + AGENTS.md charter + surface context)
             ─▶ engine.runAgent(config, { prompt, resumeChatId, outputFormat })
             ─▶ cursor-agent -p <prompt> --model <m> --workspace <repo> [--resume <id>]
             ─▶ extractResult(stdout) → { text, chatId }
             ─▶ surface renders text; persists chatId for the next turn
```

Because `--workspace` is the Tandem repo (which contains `AGENTS.md` and the PM OS submodule), the
agent has the full capability OS on disk for every call — no per-surface plumbing.

## The engine (`packages/engine`)

The smallest possible surface area over `cursor-agent`:

- `runAgent(config, opts)` — spawns the CLI with `execFile` (never a shell, so prompts are never
  interpolated into a command line), enforces a timeout + max buffer, and classifies failures:
  missing CLI, timeout, or a non-zero exit with a usable payload.
- `buildArgs(config, opts)` — assembles argv in a fixed order. Read-only calls use `--mode plan|ask`
  and drop `--force`; everything else passes `--force` (RCE by design) and `--trust`.
- `extractResult(stdout)` — tolerant extraction of the final text and a resumable `chatId`. The CLI's
  JSON shape is not contractually stable, so field names are tried in order rather than hardcoded.
- `checkCli()` — availability probe used by every surface's startup and the smoke test.

### Why no system prompt

`cursor-agent` has no `--system-prompt`. Persona/charter is therefore delivered two ways at once:
the per-surface persona is **prepended into the prompt string** (read fresh each run), and the
workspace `AGENTS.md` + `.cursor/rules/*.mdc` are **auto-loaded** by the CLI.

## Surfaces

### Slack coworker (`apps/slack`)
- **Transport:** Bolt Socket Mode, with a `search.messages` + DM `conversations.history` polling
  fallback so a dropped socket event is still picked up.
- **Self-loop guard:** the very first check is `user === botUserId`. Without it, the bot's own
  replies re-trigger it. The guard covers the socket and both pollers.
- **Dedupe:** one persisted set of handled message timestamps; a single `markHandled` point means
  socket + poll never double-deliver the same message.
- **Access gate:** owners (from `ALLOWED_USERS`) can run anything. Non-owners are refused unless the
  owner says `open thread`, which grants a TTL'd per-thread token in `open-threads.json`.
- **Continuity:** `channel:threadTs → chatId` in `sessions.json`, passed back as `--resume`. Work per
  thread is serialized through a promise queue so follow-ups don't race the file.

### Clippy (`apps/clippy`)
- **Window:** frameless, transparent, always-on-top, visible across spaces; collapsed paperclip ↔
  expanded panel. Window state persists to `userData` (the app dir is read-only once packaged).
- **`tasks.md` contract:** exactly four `##` sections. The parser keys tasks by **1-based line
  number** so mutations are line-faithful — `moveTaskInFile` extracts a task block + its indented
  sub-bullets and splices it elsewhere without reflowing the rest of the file.
- **AI actions:** `groom` runs read-only (`--mode plan`) and returns JSON the renderer applies as
  one-click moves; `capture` writes one new task to *Needs triage*.
- **Live updates:** a `chokidar` watch (with `awaitWriteFinish`) re-parses and re-renders on any
  external edit to `tasks.md`.

### Chrome extension (`apps/chrome-extension`)
- A browser can't spawn a process, so the popup talks to a **local bridge** (`127.0.0.1:8765`) that
  calls the engine. The content script extracts page context (title, URL, selection, excerpt); the
  popup offers page-aware suggestions; the bridge runs the agent in read-only `ask` mode.

## State & safety

| File | Purpose | Committed? |
|---|---|---|
| `apps/slack/state/sessions.json` | thread → chatId | no (gitignored) |
| `apps/slack/state/processed.json` | handled message ts (dedupe) | no |
| `apps/slack/state/open-threads.json` | non-owner grants (TTL) | no |
| `apps/*/.env` | tokens + config | no |
| `~/Library/Application Support/Tandem/window-state.json` | Clippy window state | n/a (userData) |

`--force` is required for the agent to act, and it means shell access on the host. The Slack
allow-list is mandatory; the browser bridge stays read-only and localhost-bound.

## Pitfalls this codebase already handles

- No `--system-prompt` → persona via prompt + `AGENTS.md`/`.cursor/rules`.
- Self-reply loop → `user === botUserId` guard at the top of the handler.
- Double delivery (socket + poll) → one dedupe set, single `markHandled`.
- `cron` can't reach the keychain/GUI session the CLI's auth needs → use a `launchd` LaunchAgent.
- Packaged Electron dir is read-only → window state goes to `userData`.
- Unstable CLI JSON → tolerant `extractResult`; verify per version with `npm run engine:smoke`.
