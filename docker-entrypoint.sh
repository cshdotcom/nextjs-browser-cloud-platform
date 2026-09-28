#!/bin/bash
set -e

echo "============================================"
echo "  NextJS 浏览器云平台 — 启动中"
echo "============================================"
echo "  PORT:           ${PORT:-3000}"
echo "  CDP_SERVER_PORT: ${CDP_SERVER_PORT:-9222}"
echo "  STEEL_API_URL:   ${STEEL_API_URL:-http://localhost:9222}"
echo "  DOCKER_API_URL:  ${DOCKER_API_URL:-unix:///var/run/docker.sock}"
echo "  STORAGE_TYPE:    ${STORAGE_TYPE:-local}"
echo "============================================"

# Ensure database directory exists
mkdir -p /app/db /app/storage

# Run database migrations / push schema
echo "[init] Pushing Prisma schema to database..."
bunx prisma db push --accept-data-loss 2>/dev/null || npx prisma db push --accept-data-loss 2>/dev/null || true

# Run seed if database is empty
echo "[init] Checking seed data..."
bun run scripts/seed-platform.ts 2>/dev/null || npx tsx scripts/seed-platform.ts 2>/dev/null || true

echo "[init] Starting NextJS server on port ${PORT:-3000}..."
exec "$@"
