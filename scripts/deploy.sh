#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${SSH_TARGET:-aliyun}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/english-learning}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/opt/node-v24.11.0-linux-x64/bin}"
BACKEND_APP="${BACKEND_APP:-english-learning-backend}"
FRONTEND_APP="${FRONTEND_APP:-english-learning-frontend}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-4011}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-same-origin}"
UPLOAD_DB=false
DRY_RUN=false
PRUNE_REMOTE=false

usage() {
  cat <<USAGE
Usage: scripts/deploy.sh [options]

Options:
  --with-db      Upload the local SQLite database to the server.
                 The server database is backed up before replacement.
  --prune        Delete remote files that no longer exist locally.
                 Use this only when you intentionally want to clean stale files.
  --dry-run      Print the rsync plan without changing the server.
  -h, --help     Show this help.

Environment overrides:
  SSH_TARGET     SSH host alias. Default: aliyun
  REMOTE_DIR     Server project directory. Default: /var/www/english-learning
  NODE_BIN_DIR   Server Node.js bin directory. Default: /opt/node-v24.11.0-linux-x64/bin
  FRONTEND_PORT  Internal frontend port. Default: 4011
  NEXT_PUBLIC_API_BASE_URL
                Frontend API base URL. Default: same-origin
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-db)
      UPLOAD_DB=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --prune)
      PRUNE_REMOTE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RSYNC_ARGS=(
  -az
  --exclude ".git/"
  --exclude ".DS_Store"
  --exclude "frontend/node_modules/"
  --exclude "frontend/dist/"
  --exclude "frontend/.next/"
  --exclude "frontend/.vinext/"
  --exclude "frontend/.wrangler/"
  --exclude "frontend/outputs/"
  --exclude "frontend/work/"
  --exclude "backend/.env"
  --exclude "frontend/.env"
  --exclude "backend/data/*.db"
  --exclude "backend/data/*.db-shm"
  --exclude "backend/data/*.db-wal"
)

if [[ "$PRUNE_REMOTE" == true ]]; then
  RSYNC_ARGS+=(--delete)
fi

if [[ "$DRY_RUN" == true ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
fi

echo "Deploying to ${SSH_TARGET}:${REMOTE_DIR}"
if [[ "$PRUNE_REMOTE" == true ]]; then
  echo "Remote pruning: enabled"
else
  echo "Remote pruning: skipped"
fi
if [[ "$UPLOAD_DB" == true ]]; then
  echo "Database upload: enabled"
else
  echo "Database upload: skipped"
fi

ssh "$SSH_TARGET" "mkdir -p '$REMOTE_DIR'"
rsync "${RSYNC_ARGS[@]}" ./ "${SSH_TARGET}:${REMOTE_DIR}/"

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run complete. No remote build or restart was run."
  exit 0
fi

if [[ "$UPLOAD_DB" == true ]]; then
  if [[ ! -f backend/data/english-learning.db ]]; then
    echo "Local database not found: backend/data/english-learning.db" >&2
    exit 1
  fi

  TMP_DB="$(mktemp -t english-learning.deploy.XXXXXX.db)"
  sqlite3 backend/data/english-learning.db ".backup '${TMP_DB}'"
  ssh "$SSH_TARGET" "set -e; mkdir -p '$REMOTE_DIR/backend/data' '$REMOTE_DIR/backend/data/backups'; if [ -f '$REMOTE_DIR/backend/data/english-learning.db' ]; then cp '$REMOTE_DIR/backend/data/english-learning.db' '$REMOTE_DIR/backend/data/backups/english-learning.\$(date +%Y%m%d-%H%M%S).db'; fi"
  scp "$TMP_DB" "${SSH_TARGET}:${REMOTE_DIR}/backend/data/english-learning.db"
  rm -f "$TMP_DB"
fi

ssh "$SSH_TARGET" "set -e
export PATH='$NODE_BIN_DIR':\$PATH
export NEXT_PUBLIC_API_BASE_URL='$NEXT_PUBLIC_API_BASE_URL'
cd '$REMOTE_DIR/frontend'
yarn install
yarn build

cd '$REMOTE_DIR'
pm2 describe '$BACKEND_APP' >/dev/null 2>&1 \\
  && pm2 restart '$BACKEND_APP' --update-env \\
  || pm2 start '$NODE_BIN_DIR/node' --name '$BACKEND_APP' --cwd '$REMOTE_DIR' -- backend/src/server.js

cd '$REMOTE_DIR/frontend'
pm2 describe '$FRONTEND_APP' >/dev/null 2>&1 \\
  && pm2 restart '$FRONTEND_APP' --update-env \\
  || pm2 start ./node_modules/.bin/vinext --name '$FRONTEND_APP' --cwd '$REMOTE_DIR/frontend' -- start --hostname '$FRONTEND_HOST' --port '$FRONTEND_PORT'

pm2 save
nginx -t
nginx -s reload
pm2 list
"

echo "Deploy complete."
