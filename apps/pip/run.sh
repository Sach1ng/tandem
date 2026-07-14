#!/usr/bin/env bash
# Launch Pip from launchd (login) or manually. Needs a GUI session for Electron + cursor-agent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

ENV_FILE="${TANDEM_AUTOSTART_ENV:-$HOME/.tandem/autostart.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi
export TANDEM_WORKSPACE="${TANDEM_WORKSPACE:-$HOME/.tandem}"

NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  echo "node not found on PATH — install Node >= 20.6 or fix NVM in $ENV_FILE" >&2
  exit 1
fi

exec "$NODE" "$ROOT/bin/pip.mjs"
