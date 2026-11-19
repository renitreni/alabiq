#!/usr/bin/env bash
# Alabiq production auto-deploy — triggered by the bare repo's post-receive hook
# (or run manually as root on srv1777854).
#
# Full-Laravel stack: the checkout root IS the app (no alabiq-web-main/ subdir,
# no separate frontend dist). The web container serves Blade + /api/* from
# public/, so deploy = rebuild images + migrate + up -d + health checks.
#
# Flow:
#   1. reset live checkout to the pushed sha of the deploy branch
#   2. rebuild images (app, web, migrate, seed-reference, queue-worker, scheduler)
#   3. apply migrations (one-shot migrate container, idempotent)
#   4. docker compose up -d
#   5. wait for the web edge on 127.0.0.1:4001, then external smoke checks
#      (health 200, login probe 401)
#
# Rollback: reset the bare repo's deploy branch (or the checkout) to the last
# good sha and run this script again.
#
# Env note: compose now reads .env from the CHECKOUT ROOT (where
# docker-compose.yml lives). The old alabiq-web-main/.env must be moved to
# $CHECKOUT/.env before the first deploy from the full-Laravel layout.
set -euo pipefail

# Inherited when invoked from a git hook — would corrupt git commands below.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

DEPLOY_REF="${DEPLOY_REF:-refs/heads/full}"
BARE_REPO="/opt/SmartMappiaa/smartmappiaa.git"
CHECKOUT="/opt/SmartMappiaa/alabiq-docker"
APP_DIR="$CHECKOUT"                       # repo root = Laravel app root
COMPOSE_PROJECT="smartmappia-web-main"    # pinned — owns existing volumes/network
LOG="/var/log/alabiq-deploy.log"
HEALTH_INTERNAL="http://127.0.0.1:4001/api/health"
HEALTH_EXTERNAL="https://alabiq.yaramay.online/api/health"
LOGIN_PROBE_URL="https://alabiq.yaramay.online/api/auth/login"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# One deploy at a time — concurrent pushes wait out rather than interleave.
exec 9>/tmp/alabiq-deploy.lock
if ! flock -n 9; then
  log "SKIP: another deploy is already running"
  exit 1
fi

log "===== deploy started (ref=$DEPLOY_REF) ====="

cd "$CHECKOUT"
git fetch "$BARE_REPO" "$DEPLOY_REF"
git reset --hard FETCH_HEAD
SHA="$(git rev-parse --short HEAD)"
log "checkout reset to $SHA"

if [ ! -f "$APP_DIR/.env" ]; then
  log "FAIL: $APP_DIR/.env missing — compose requires it (POSTGRES_PASSWORD etc.)."
  log "      Move the former alabiq-web-main/.env up to the checkout root."
  exit 1
fi

cd "$APP_DIR"
log "building images (app web migrate seed-reference queue-worker scheduler)..."
docker compose -p "$COMPOSE_PROJECT" build

log "applying migrations..."
docker compose -p "$COMPOSE_PROJECT" run --rm migrate

log "restarting services..."
docker compose -p "$COMPOSE_PROJECT" up -d

log "waiting for web health ($HEALTH_INTERNAL)..."
ok=0
for _ in $(seq 1 30); do
  if curl -sf "$HEALTH_INTERNAL" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  log "FAIL: web did not become healthy at $HEALTH_INTERNAL"
  exit 1
fi
log "web healthy"

# External smoke checks (DEPLOYMENT-PLAN.md prevention checklist).
ext_health="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_EXTERNAL" || true)"
ext_login="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$LOGIN_PROBE_URL" \
  -H 'Content-Type: application/json' -d '{"email":"x@x.x","password":"x"}' || true)"
port_4001="$(ss -tln 2>/dev/null | grep -c '127.0.0.1:4001' || true)"
log "smoke: external health=$ext_health (want 200) login=$ext_login (want 401) port4001=$port_4001 (want >=1)"

if [ "$ext_health" = 200 ] && [ "$ext_login" = 401 ]; then
  log "===== deploy $SHA OK ====="
else
  log "===== deploy $SHA FINISHED WITH WARNINGS — verify manually (DEPLOYMENT-PLAN.md prevention checklist) ====="
  exit 1
fi
