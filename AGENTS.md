# Tandem — Workspace Charter

This file is auto-loaded by `cursor-agent` (and other AGENTS.md-aware runtimes) on every run.
It is the shared, persistent context that every Tandem surface (Slack, Clippy, the browser
extension) inherits when it shells out to the Cursor CLI. Keep it terse and high-signal.

## What this workspace is

Tandem is an ambient AI coworker layer. It does not own intelligence of its own — it carries a
capability OS (PM OS, mounted at `external/pm-operating-os`) into the places work happens. When a
surface invokes the engine, the agent runs here, with this charter and PM OS's skills, knowledge,
and memory available on disk.

## How to behave when invoked

- Lead with the answer. No preamble, no menus, no "I will now…".
- Act end-to-end. If a task can be completed with the tools available, complete it.
- State assumptions explicitly. Flag anything irreversible before doing it.
- Cite the workspace files and dates you used. Do not invent facts, names, or numbers.
- Prefer PM OS skills and knowledge (`external/pm-operating-os/skills`, `/knowledge`, `/memory`)
  when the task is a PM task (PRD, strategy, launch, exec update, decision log, etc.).

## The brain: PM OS

`external/pm-operating-os/` is a git submodule — a self-serve Cursor/Codex setup for PMs containing:
- `skills/` — PRD writer, strategy connector, launch readiness, exec communicator, decision logger…
- `knowledge/` — strategy, customer segments, metrics, positioning
- `memory/` — decisions, feedback, weekly plans (compounding context across runs)

Treat PM OS as authoritative for PM workflows. Tandem's job is to route the right request to it
from the right surface, and return a clean result.
