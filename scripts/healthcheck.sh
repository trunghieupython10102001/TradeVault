#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-tradevault}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000/}"
API_URL="${API_URL:-http://127.0.0.1:4000/health}"
WEBHOOK_URL="${MONITORING_WEBHOOK_URL:-}"

FAILED=()

check_service() {
  local label="$1" url="$2" pm2_name="$3"
  if ! curl -fsS --max-time 10 "${url}" >/dev/null 2>&1; then
    FAILED+=("${label}")
    pm2 restart "${pm2_name}" >/dev/null 2>&1 || true
    logger -t "${APP_NAME}-healthcheck" "${label} down — restart attempted"
  fi
}

check_service "web" "${WEB_URL}" "${APP_NAME}"
check_service "api" "${API_URL}" "${APP_NAME}-api"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  MSG="${APP_NAME} DOWN: ${FAILED[*]} on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  logger -t "${APP_NAME}-healthcheck" "${MSG}"
  if [[ -n "${WEBHOOK_URL}" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      --data "{\"text\":\"${MSG}\"}" \
      "${WEBHOOK_URL}" >/dev/null || true
  fi
  exit 1
fi
