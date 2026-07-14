#!/usr/bin/env bash
# Always-on launcher for the Pip Slack coworker.
# Use with the launchd plist (RunAtLoad + KeepAlive) — NOT cron, which can't reach the
# keychain/GUI session that cursor-agent's auth needs.
set -euo pipefail
cd "$(dirname "$0")"

# Make sure cursor-agent is on PATH for non-login shells.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

exec npm start
