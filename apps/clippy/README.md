# Tandem — Clippy

A frameless, always-on-top desktop paperclip. Clippy is Tandem's **visual** surface: snip a region
of your screen and ask about it, plus a live task board backed by a plain `tasks.md`.

## Run (macOS)
```bash
npm start          # from this directory, or: npm run clippy (from repo root)
```
First run needs `cursor-agent login` done once.

- **Click** the paperclip to expand/collapse · **drag** to move · **right-click** for the menu.
- **Snip** → native region capture (`screencapture -i`). Then ask anything about the shot —
  "what's causing this error?", "explain this stack trace". Read-only; the agent only views the image.
- **Capture** box → adds a task to *Needs triage* via the agent.
- **Groom** → read-only review: focus list, suggested moves (one-click apply), stale items.

> Screenshots are saved to `.tandem/screenshots/` in the workspace (gitignored). Image understanding
> depends on the model you've selected supporting vision; if it can't view the image, it will say so.

## Point it at your tasks
By default it reads `tasks.example.md` at the repo root. To use your own file, create
`config.json` here (gitignored) and override:
```json
{ "tasksFile": "/absolute/path/to/your/tasks.md" }
```

## tasks.md contract
Exactly four `##` sections; `## Archive` / `## Done` / `## How to use` / `---` ends parsing.
```markdown
## Active (priority today)
- [ ] Ship the launch gate #project/x #p0
  - Due: 2026-07-02
  - Next action: …
## Needs triage
- [ ] Look into … #from/self #p2
```
Tasks are keyed by line number, so moves and toggles are line-faithful — the rest of the file is
never reflowed.

## Package
```bash
npm run package    # electron-packager → release/ (darwin arm64)
```
Run at login via a Login Item, Raycast, or Hammerspoon.
