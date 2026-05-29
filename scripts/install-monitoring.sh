#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-tradevault}"
APP_DIR="${APP_DIR:-/var/www/tradevault}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/}"
MONITORING_WEBHOOK_URL="${MONITORING_WEBHOOK_URL:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

install -m 0755 "${APP_DIR}/scripts/healthcheck.sh" "/usr/local/bin/${APP_NAME}-healthcheck"

cat > "/etc/${APP_NAME}-monitoring.env" <<ENV
APP_NAME=${APP_NAME}
HEALTHCHECK_URL=${HEALTHCHECK_URL}
MONITORING_WEBHOOK_URL=${MONITORING_WEBHOOK_URL}
ENV

chmod 600 "/etc/${APP_NAME}-monitoring.env"

cat > "/etc/systemd/system/${APP_NAME}-healthcheck.service" <<UNIT
[Unit]
Description=${APP_NAME} HTTP healthcheck

[Service]
Type=oneshot
EnvironmentFile=/etc/${APP_NAME}-monitoring.env
ExecStart=/usr/local/bin/${APP_NAME}-healthcheck
UNIT

cat > "/etc/systemd/system/${APP_NAME}-healthcheck.timer" <<UNIT
[Unit]
Description=Run ${APP_NAME} HTTP healthcheck every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Unit=${APP_NAME}-healthcheck.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now "${APP_NAME}-healthcheck.timer"

echo "Monitoring timer installed. Check with: systemctl status ${APP_NAME}-healthcheck.timer"
