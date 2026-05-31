#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-tradevault}"
APP_DIR="${APP_DIR:-/var/www/tradevault}"
APP_PORT="${APP_PORT:-3000}"
SSH_USER="${SSH_USER:-ubuntu}"
DOMAIN="${DOMAIN:?Set DOMAIN to your Vercel-managed domain, for example tradevault.example.com}"
NODE_MAJOR="${NODE_MAJOR:-24}"
REPO_URL="${REPO_URL:?Set REPO_URL to your Git remote, for example https://github.com/trunghieupython10102001/TradeVault.git}"
BRANCH="${BRANCH:-main}"
ENABLE_SSL="${ENABLE_SSL:-false}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo DOMAIN=... REPO_URL=... bash scripts/ec2-bootstrap.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git nginx ufw postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q "^v${NODE_MAJOR}\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

install -d -o "${SSH_USER}" -g "${SSH_USER}" "${APP_DIR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo -u "${SSH_USER}" git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
else
  sudo -u "${SSH_USER}" git -C "${APP_DIR}" fetch origin "${BRANCH}"
  sudo -u "${SSH_USER}" git -C "${APP_DIR}" checkout "${BRANCH}"
  sudo -u "${SSH_USER}" git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
fi

cat > /etc/nginx/sites-available/${APP_NAME} <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ ! -f "/etc/systemd/system/pm2-${SSH_USER}.service" ]]; then
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${SSH_USER}" --hp "/home/${SSH_USER}"
fi

if [[ "${ENABLE_SSL}" == "true" ]]; then
  apt-get install -y certbot python3-certbot-nginx
  if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect
  else
    certbot --nginx -d "${DOMAIN}" --non-interactive --register-unsafely-without-email --agree-tos --redirect
  fi
fi

echo "Bootstrap done. Put production env in ${APP_DIR}/apps/web/.env, then run scripts/ec2-deploy.sh."
