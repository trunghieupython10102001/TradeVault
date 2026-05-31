#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-tradevault}"
APP_DIR="${APP_DIR:-/var/www/tradevault}"
BRANCH="${BRANCH:-main}"
PRISMA_SCHEMA="packages/database/prisma/schema.prisma"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-false}"

cd "${APP_DIR}"

if [[ "${SKIP_GIT_PULL}" != "true" ]]; then
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"
fi

npm install --include=dev

set -a
source apps/web/.env
set +a
npx prisma generate --schema="${PRISMA_SCHEMA}"
npm run build --workspace=@repo/database
(
  cd packages/database
  npx prisma migrate deploy
)
npm run build --workspace=trading-journal

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  pm2 reload "${APP_NAME}" --update-env
else
  (
    cd apps/web
    pm2 start npm --name "${APP_NAME}" -- start
  )
fi

pm2 save
