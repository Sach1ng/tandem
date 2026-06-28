# Tandem — Clippy

A frameless, always-on-top desktop paperclip backed by a plain `tasks.md`. Click to expand a live
task board (Active / Scheduled / Waiting / Needs triage). Capture tasks and run an AI **groom** via
the Cursor CLI.

## Run (macOS)
```bash
npm start          # from this directory, or: npm run clippy (from repo root)
```
First run needs `cursor-agent login` done once.

- **Click** the paperclip to expand/collapse · **drag** to move · **right-click** for the menu.
- **Capture** box → adds a task to *Needs triage* via the agent.
- **Groom** → read-only review: focus list, suggested moves (one-click apply), stale items.

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
