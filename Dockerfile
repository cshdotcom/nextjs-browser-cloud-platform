# ============================================================
# NextJS 企业级远程浏览器工作平台 — Docker 镜像
# 支持 host 网络模式 + 可变 CDP 服务端口
# ============================================================

FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# Install bun
# ============================================================
FROM base AS bun-install
RUN npm install -g bun

# ============================================================
# Dependencies
# ============================================================
FROM bun-install AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile 2>/dev/null || bun install
RUN bunx prisma generate

# ============================================================
# Build
# ============================================================
FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Build standalone output
RUN bun run build 2>/dev/null || npx next build

# Copy standalone artifacts
RUN cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
RUN cp -r public .next/standalone/public 2>/dev/null || true
RUN cp -r prisma .next/standalone/prisma 2>/dev/null || true
RUN cp -r db .next/standalone/db 2>/dev/null || true || mkdir -p .next/standalone/db

# ============================================================
# Production image
# ============================================================
FROM bun-install AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# CDP 服务端后台端口（可通过环境变量改变）
ENV CDP_SERVER_PORT=9222
# Steel-Browser API 地址
ENV STEEL_API_URL=http://localhost:9222
# Docker API 地址
ENV DOCKER_API_URL=unix:///var/run/docker.sock
# 存储类型
ENV STORAGE_TYPE=local
ENV STORAGE_LOCAL_PATH=/app/storage
# 密钥（生产环境必须替换）
ENV JWT_SECRET=change-me-in-production-32-bytes-min
ENV SECRET_ENCRYPTION_KEY=change-me-encryption-key-32bytes
ENV CAPTCHA_SECRET=change-me-captcha-secret-32bytes
# 定时任务密钥
ENV CRON_SECRET=change-me-cron-secret

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db

# Create storage directory
RUN mkdir -p /app/storage /app/db

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose ports (NextJS + CDP)
EXPOSE 3000 9222

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
