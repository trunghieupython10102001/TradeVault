#!/usr/bin/env bash
set -euo pipefail

URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/}"
APP_NAME="${APP_NAME:-tradevault}"
WEBHOOK_URL="${MONITORING_WEBHOOK_URL:-}"

if curl -fsS --max-time 10 "${URL}" >/dev/null; then
  exit 0
fi

pm2 restart "${APP_NAME}" >/dev/null 2>&1 || true

MESSAGE="${APP_NAME} healthcheck failed on $(hostname). PM2 restart attempted. URL: ${URL}"
logger -t "${APP_NAME}-healthcheck" "${MESSAGE}"

if [[ -n "${WEBHOOK_URL}" ]]; then
  curl -fsS -X POST -H 'Content-Type: application/json' \
    --data "{\"text\":\"${MESSAGE}\"}" \
    "${WEBHOOK_URL}" >/dev/null || true
fi

exit 1
