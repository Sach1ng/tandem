#!/usr/bin/env bash
#
# Tandem — one-command installer for Pip, your ambient AI coworker.
#
#   curl -fsSL https://raw.githubusercontent.com/Sach1ng/tandem/main/install.sh | bash
#
# Safe to re-run. It will:
#   1. check Node >= 20.6 (and git),
#   2. clone or update the Tandem repo (~/.tandem-app),
#   3. install deps + build,
#   4. put the `tandem` command on your PATH,
#   5. make sure the Cursor CLI is installed,
#   6. initialize your workspace (~/.tandem) with a self-growing brain.
#
# PM OS is optional — Pip builds your context as you go.
set -euo pipefail

REPO_URL="${TANDEM_REPO_URL:-https://github.com/Sach1ng/tandem.git}"
APP_DIR="${TANDEM_APP_DIR:-$HOME/.tandem-app}"
BRANCH="${TANDEM_BRANCH:-main}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

bold "Tandem installer"

# 1. Prerequisites -------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js is required (>= 20.6). Install from https://nodejs.org and re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 6 ]; }; then
  die "Node >= 20.6 required (found $(node -v))."
fi
ok "Node $(node -v)"
command -v git >/dev/null 2>&1 || die "git is required."

# 2. Clone or update -----------------------------------------------------------
# If run from inside a Tandem checkout, use it in place; otherwise clone.
if [ -f "package.json" ] && node -p "require('./package.json').name" 2>/dev/null | grep -q '^tandem$'; then
  APP_DIR="$(pwd)"
  info "Using current checkout: $APP_DIR"
elif [ -d "$APP_DIR/.git" ]; then
  info "Updating existing install at $APP_DIR"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH" || warn "Could not fast-forward; continuing with current checkout."
else
  info "Cloning into $APP_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
ok "Source ready"

cd "$APP_DIR"

# 3. Install + build -----------------------------------------------------------
info "Installing dependencies (this can take a minute)…"
npm install --no-fund --no-audit >/dev/null 2>&1 || npm install
ok "Dependencies installed"
info "Building…"
npm run build >/dev/null 2>&1 || npm run build
ok "Built"

# 4. Put `tandem` on PATH ------------------------------------------------------
if npm link --workspace @tandem/cli >/dev/null 2>&1 || (cd packages/cli && npm link >/dev/null 2>&1); then
  ok "Linked the 'tandem' command"
else
  warn "Could not 'npm link' globally (permissions?). You can still run Pip with:"
  info "  node \"$APP_DIR/packages/cli/bin/tandem.mjs\" <command>"
fi

# 5. Cursor CLI ----------------------------------------------------------------
if command -v cursor-agent >/dev/null 2>&1; then
  ok "Cursor CLI present ($(cursor-agent --version 2>/dev/null | head -n1 || echo installed))"
else
  warn "Cursor CLI not found — installing it now…"
  curl https://cursor.com/install -fsS | bash || warn "Cursor CLI install failed; install manually: curl https://cursor.com/install -fsS | bash"
  warn "After install, run: cursor-agent login"
fi

# 6. Initialize workspace ------------------------------------------------------
if command -v tandem >/dev/null 2>&1; then
  tandem init || true
else
  node "$APP_DIR/packages/cli/bin/tandem.mjs" init || true
fi

echo
bold "Done. Next:"
info "1. cursor-agent login        # if you haven't already"
info "2. tandem pip                # launch Pip on your desktop"
info "   (Slack:  tandem slack connect && tandem slack start)"
echo
info "No PM OS needed — Pip starts with a blank memory and grows it as you work."
