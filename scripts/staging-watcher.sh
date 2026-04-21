#!/bin/bash
# staging-watcher.sh — Poll main branch, rebuild Docker image locally
#
# Setup:
#   1. chmod +x /opt/librarian/scripts/staging-watcher.sh
#   2. crontab -e and add:
#
#        REPO_DIR_LIBRARIAN=/opt/librarian
#        SCHOLIO_DIR=/opt/scholio
#
#        # Check staging every 10 minutes
#        */10 * * * * /opt/librarian/scripts/staging-watcher.sh >> /var/log/librarian-watcher.log 2>&1

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR_LIBRARIAN:-/opt/librarian}"

ENV_FILE="${REPO_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  SLACK_WEBHOOK_URL=$(grep -E '^SLACK_WEBHOOK_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' || true)
fi
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

REPO_NAME="librarian"
LOCK_FILE="/tmp/librarian-watcher.lock"

# ── Lock ──────────────────────────────────────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[watcher] Already running (pid $LOCK_PID), skipping."
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[watcher] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

notify_slack() {
  [ -z "$SLACK_WEBHOOK_URL" ] && return 0
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"$1\"}" || true
}

# ── Check for new commits ─────────────────────────────────────────────────────
cd "$REPO_DIR"
git checkout staging --quiet
git fetch origin staging --quiet

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/staging)

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "No changes on staging (${LOCAL_SHA:0:8}). Nothing to do."
  exit 0
fi

log "New commits detected: ${LOCAL_SHA:0:8} → ${REMOTE_SHA:0:8}"

CHANGED_FILES=$(git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA")
log "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'

# ── Pull ──────────────────────────────────────────────────────────────────────
git pull origin staging --quiet
log "Pulled staging."

# ── Build ─────────────────────────────────────────────────────────────────────
log "--- build-app ---"
BUILD_FAILED=false

if docker build \
    --platform linux/amd64 \
    -t "${REPO_NAME}:latest" \
    -f "${REPO_DIR}/Dockerfile" \
    "${REPO_DIR}"; then
  log "Built ${REPO_NAME}:latest OK"
else
  log "ERROR: build-app failed"
  BUILD_FAILED=true
fi

# ── Notify ────────────────────────────────────────────────────────────────────
if $BUILD_FAILED; then
  log "Build failed."
  notify_slack "🔴 *Build failed* · \`${REPO_NAME}\` · branch \`staging\` @ \`${REMOTE_SHA:0:8}\`"
  exit 1
fi

notify_slack "✅ *Build OK* · \`${REPO_NAME}\` · branch \`staging\` @ \`${REMOTE_SHA:0:8}\`"

# ── Restart prod stack ────────────────────────────────────────────────────────
SCHOLIO_DIR="${SCHOLIO_DIR:-/opt/scholio}"
log "Restarting docker compose stack in ${SCHOLIO_DIR} ..."
if docker compose -f "${SCHOLIO_DIR}/docker-compose.prod.yml" up -d; then
  log "Stack restarted OK."
  notify_slack "🚀 *Restarted* · \`${REPO_NAME}\` · branch \`staging\` @ \`${REMOTE_SHA:0:8}\`"
else
  log "ERROR: docker compose up failed."
  notify_slack "🔴 *Restart failed* · \`${REPO_NAME}\` · branch \`staging\` @ \`${REMOTE_SHA:0:8}\`"
  exit 1
fi

log "Done."
