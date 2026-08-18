#!/usr/bin/env bash
# FOOTBASE — deploy script for the Contabo VPS (run FROM INSIDE the cloned repo).
#
# Idempotent: safe to re-run on every deploy. Never touches `.env` (must already
# exist on the VPS — never comes from git, see .env.example for the required keys).
# This is the "disaster recovery" script referenced in PLANO_EXECUCAO_V3.md's Fase 9:
# if the VPS ever needs to be rebuilt (or the app moved to a different provider), the
# whole app has no server-side state of its own (everything lives in Supabase), so
# `git clone` + this script is the entire recovery procedure.
#
# Usage: ./deploy.sh

set -euo pipefail

APP_NAME="footbase"
STANDALONE_DIR=".next/standalone"

if [ ! -d .git ]; then
  echo "ERROR: not inside a git checkout. First-time setup on a new machine:" >&2
  echo "  git clone https://github.com/fbscout2026/footbase.git && cd footbase" >&2
  echo "  # create .env here (see .env.example), then run ./deploy.sh" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd). Create it before deploying (see .env.example)." >&2
  echo "It is never committed to git — must be created directly on this machine." >&2
  exit 1
fi

echo "==> Pulling latest code (main)"
git fetch origin main
git reset --hard origin/main

echo "==> Installing dependencies (npm ci)"
npm ci

echo "==> Building production bundle"
npm run build

echo "==> Assembling standalone runtime (static assets aren't auto-copied by Next.js)"
rm -rf "$STANDALONE_DIR/public" "$STANDALONE_DIR/.next/static"
cp -r public "$STANDALONE_DIR/public"
mkdir -p "$STANDALONE_DIR/.next"
cp -r .next/static "$STANDALONE_DIR/.next/static"
cp .env "$STANDALONE_DIR/.env"

echo "==> Starting/reloading via pm2"
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 reload "$APP_NAME"
else
  pm2 start "$STANDALONE_DIR/server.js" --name "$APP_NAME" --cwd "$STANDALONE_DIR"
  pm2 save
fi

echo "==> Done."
pm2 status "$APP_NAME"
