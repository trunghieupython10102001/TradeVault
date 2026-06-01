#!/usr/bin/env bash
# migrate-db.sh — dump from Neon, restore to local EC2 PostgreSQL
# Usage: NEON_URL="postgresql://..." LOCAL_URL="postgresql://..." bash scripts/migrate-db.sh
set -euo pipefail

NEON_URL="${NEON_URL:?Set NEON_URL to your Neon connection string}"
LOCAL_URL="${LOCAL_URL:-postgresql://postgres:password123@localhost:5432/tradevault}"
DUMP_FILE="/tmp/tradevault_neon_dump_$(date +%Y%m%d_%H%M%S).sql"

echo "Dumping from Neon..."
pg_dump "$NEON_URL" --no-owner --no-acl --format=plain -f "$DUMP_FILE"

echo "Restoring to local PostgreSQL..."
psql "$LOCAL_URL" -f "$DUMP_FILE"

echo "Done. Dump file: $DUMP_FILE"
