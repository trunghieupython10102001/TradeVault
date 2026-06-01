#!/usr/bin/env bash
# Run once on EC2 as root:
#   sudo APP_NAME=tradevault ALERT_EMAIL=you@example.com bash scripts/install-monitoring.sh
# Optional env vars:
#   MONITORING_WEBHOOK_URL  — Slack/Discord-compatible webhook for down alerts
#   ALERT_EMAIL             — email address for Netdata health alerts
set -euo pipefail

APP_NAME="${APP_NAME:-tradevault}"
APP_DIR="${APP_DIR:-/var/www/tradevault}"
SSH_USER="${SSH_USER:-ubuntu}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000/}"
API_URL="${API_URL:-http://127.0.0.1:4000/health}"
MONITORING_WEBHOOK_URL="${MONITORING_WEBHOOK_URL:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

# ── 1. Netdata ────────────────────────────────────────────────────────────────
echo "=== 1/4 Netdata ==="
if ! command -v netdata >/dev/null 2>&1; then
  wget -qO /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh
  sh /tmp/netdata-kickstart.sh --non-interactive --stable-channel --disable-telemetry
  rm /tmp/netdata-kickstart.sh
else
  echo "Netdata already installed."
fi

# Configure alert notifications
NOTIFY_CONF="/etc/netdata/health_alarm_notify.conf"
if [[ -f "${NOTIFY_CONF}" ]]; then
  if [[ -n "${ALERT_EMAIL}" ]]; then
    sed -i "s|^#*\s*SEND_EMAIL=.*|SEND_EMAIL=\"YES\"|" "${NOTIFY_CONF}"
    sed -i "s|^#*\s*DEFAULT_RECIPIENT_EMAIL=.*|DEFAULT_RECIPIENT_EMAIL=\"${ALERT_EMAIL}\"|" "${NOTIFY_CONF}"
    echo "Netdata email alerts → ${ALERT_EMAIL}"
  fi
  if [[ -n "${MONITORING_WEBHOOK_URL}" ]]; then
    sed -i "s|^#*\s*SEND_SLACK=.*|SEND_SLACK=\"YES\"|" "${NOTIFY_CONF}"
    sed -i "s|^#*\s*SLACK_WEBHOOK_URL=.*|SLACK_WEBHOOK_URL=\"${MONITORING_WEBHOOK_URL}\"|" "${NOTIFY_CONF}"
    sed -i "s|^#*\s*DEFAULT_RECIPIENT_SLACK=.*|DEFAULT_RECIPIENT_SLACK=\"#alerts\"|" "${NOTIFY_CONF}"
    echo "Netdata webhook alerts configured."
  fi
  systemctl restart netdata
fi

# Block Netdata port externally — access via SSH tunnel only
ufw deny 19999 >/dev/null 2>&1 || true

# ── 2. PM2 log rotation ───────────────────────────────────────────────────────
echo "=== 2/4 PM2 log rotation ==="
sudo -u "${SSH_USER}" pm2 install pm2-logrotate 2>/dev/null || true
sudo -u "${SSH_USER}" pm2 set pm2-logrotate:max_size 50M
sudo -u "${SSH_USER}" pm2 set pm2-logrotate:retain 7
sudo -u "${SSH_USER}" pm2 set pm2-logrotate:compress true
sudo -u "${SSH_USER}" pm2 save

# ── 3. Health check (systemd timer, every 5 min) ──────────────────────────────
echo "=== 3/4 Health check timer ==="
install -m 0755 "${APP_DIR}/scripts/healthcheck.sh" "/usr/local/bin/${APP_NAME}-healthcheck"

cat > "/etc/${APP_NAME}-monitoring.env" <<ENV
APP_NAME=${APP_NAME}
WEB_URL=${WEB_URL}
API_URL=${API_URL}
MONITORING_WEBHOOK_URL=${MONITORING_WEBHOOK_URL}
ENV
chmod 600 "/etc/${APP_NAME}-monitoring.env"

cat > "/etc/systemd/system/${APP_NAME}-healthcheck.service" <<UNIT
[Unit]
Description=${APP_NAME} HTTP health check

[Service]
Type=oneshot
User=${SSH_USER}
EnvironmentFile=/etc/${APP_NAME}-monitoring.env
ExecStart=/usr/local/bin/${APP_NAME}-healthcheck
UNIT

cat > "/etc/systemd/system/${APP_NAME}-healthcheck.timer" <<UNIT
[Unit]
Description=Run ${APP_NAME} health check every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=${APP_NAME}-healthcheck.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now "${APP_NAME}-healthcheck.timer"

# ── 4. Summary ────────────────────────────────────────────────────────────────
echo ""
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "<EC2_IP>")
echo "=== 4/4 Done ==="
echo ""
echo "Netdata dashboard (SSH tunnel):"
echo "  ssh -L 19999:localhost:19999 ubuntu@${EC2_IP}"
echo "  then open http://localhost:19999"
echo ""
echo "Health check timer:  systemctl status ${APP_NAME}-healthcheck.timer"
echo "Run check now:       systemctl start ${APP_NAME}-healthcheck.service"
echo "PM2 logs:            sudo -u ${SSH_USER} pm2 logs"
echo ""
echo "External uptime (UptimeRobot — free):"
echo "  https://uptimerobot.com → New Monitor → HTTP(S)"
echo "  URL 1: https://tradevaultjournal.vercel.app"
echo "  URL 2: http://${EC2_IP}:4000/health"
echo "  Interval: 5 min, alert: email"
