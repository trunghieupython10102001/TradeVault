#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-tradevault}"
APP_DIR="${APP_DIR:-/var/www/tradevault}"
BRANCH="${BRANCH:-main}"
PRISMA_SCHEMA="packages/database/prisma/schema.prisma"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-false}"

cd "${APP_DIR}"

mkdir -p "${APP_DIR}/apps/api/uploads"

if [[ "${SKIP_GIT_PULL}" != "true" ]]; then
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"
fi

# Install production deps only — build artifacts are shipped by CI
npm ci --omit=dev

set -a
source apps/web/.env
set +a

# Generate Prisma client for the runtime environment
npx prisma generate --schema="${PRISMA_SCHEMA}"

# Apply any pending migrations
(
  cd packages/database
  npx prisma migrate deploy
)

# Reload Next.js app
API_NAME="${APP_NAME}-api"
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  pm2 reload "${APP_NAME}" --update-env
else
  (cd apps/web && pm2 start npm --name "${APP_NAME}" -- start)
fi

# Reload Express API
if pm2 describe "${API_NAME}" >/dev/null 2>&1; then
  pm2 reload "${API_NAME}" --update-env
else
  (cd apps/api && pm2 start npm --name "${API_NAME}" -- start)
fi

pm2 save
