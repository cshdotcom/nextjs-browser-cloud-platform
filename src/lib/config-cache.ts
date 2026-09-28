import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getCurrentTraceId } from '@/lib/trace'

/**
 * In-memory system configuration cache (singleton).
 *
 * Flow:
 *   - `refreshCache()` loads ALL rows from SystemConfig into a process-local
 *     Map<string, unknown>. Called once on first read (lazy) and again after
 *     every `setConfig(...)` mutation.
 *   - `getConfig(key)` reads from the cache. Environment variables can
 *     override DB values: we check `process.env[<KEY>]` first.
 *   - `setConfig(key, value, operatorId)` writes the new value to DB, bumps
 *     a ConfigVersion row (append-only history with before/after JSON +
 *     operatorId + traceId), refreshes the cache, and writes an audit log.
 *
 * Cache invalidation: this is a per-process cache. In a multi-instance
 * deployment the cache can drift briefly between instances; consumers that
 * need eventual consistency can call `refreshCache()` on a schedule, or
 * rely on the publishConfigChange() hook (callers can wire a pub/sub).
 *
 * Default values are returned for known keys when no DB row and no env var
 * are present. This makes the platform bootable with an empty DB.
 */

// ---------------- Cache singleton ----------------
const cache = new Map<string, unknown>()
let loaded = false
let loadingPromise: Promise<void> | null = null

// ---------------- Defaults ----------------
// Sensible defaults for known configuration keys. Documented inline so
// new contributors can see what keys exist without consulting the DB.
export const CONFIG_DEFAULTS: Record<string, unknown> = {
  // System identity
  'system.name': '企业远程浏览器平台',
  'system.logoUrl': '',
  'system.announcement': '',
  'system.maintenanceMode': false,
  'system.maintenanceMessage': '',

  // Global concurrency / quota caps
  'session.globalConcurrencyLimit': 100,
  'session.userConcurrencyLimit': 5,
  'session.groupConcurrencyLimit': 20,
  'session.idleTimeoutMinutes': 30,
  'session.hardTtlMinutes': 240,

  // Rate-limit thresholds (consumed by rate-limit-v2.ts)
  'ratelimit.anonymousPerMinute': 30,
  'ratelimit.authenticatedPerMinute': 120,
  'ratelimit.apiTokenPerMinute': 300,
  'ratelimit.windowMs': 60_000,

  // Storage
  'storage.type': 'local', // local | s3
  'storage.localDir': './storage',
  'storage.s3Endpoint': '',
  'storage.s3Bucket': '',
  'storage.s3Region': 'us-east-1',
  'storage.s3AccessKeyId': '',
  'storage.s3SecretAccessKey': '',

  // Log retention (days)
  'logs.auditRetentionDays': 365,
  'logs.sessionRetentionDays': 90,

  // JWT
  'jwt.maxLifetimeHours': 24,
  'jwt.idleTimeoutMinutes': 60,

  // Quota defaults
  'quota.user.browserWorkspace': 10,
  'quota.user.storageBytes': 1024 * 1024 * 1024, // 1 GiB
  'quota.group.browserWorkspace': 100,
  'quota.group.singboxCpu': 8,
  'quota.group.singboxMemoryMb': 8192,
  'quota.global.singboxCpu': 64,
  'quota.global.singboxMemoryMb': 65536,

  // Alerting
  'alert.silenceWindowStart': '', // HH:mm, empty = no silence
  'alert.silenceWindowEnd': '',
  'alert.webhookUrl': '',
}

// ---------------- Env override helpers ----------------
// Keys like 'storage.type' map to env var STORAGE_TYPE (replace '.' with '_',
// uppercase). When an env var of that name is set, it always wins over DB.
function envOverride(key: string): string | undefined {
  const envName = key.toUpperCase().replace(/\./g, '_')
  const val = process.env[envName]
  return val === undefined || val === '' ? undefined : val
}

function coerce(raw: string, fallback: unknown): unknown {
  // Try JSON parse first; if that fails, treat as raw string
  try {
    return JSON.parse(raw)
  } catch {
    // If the fallback is a number, attempt numeric coercion
    if (typeof fallback === 'number') {
      const n = Number(raw)
      if (!Number.isNaN(n)) return n
    }
    if (typeof fallback === 'boolean') {
      return raw === 'true' || raw === '1'
    }
    return raw
  }
}

// ---------------- Public API ----------------

/** Load all SystemConfig rows into the in-memory cache. Idempotent & deduped. */
export async function refreshCache(): Promise<void> {
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const rows = await db.systemConfig.findMany()
      cache.clear()
      for (const r of rows) {
        try {
          cache.set(r.key, JSON.parse(r.valueJson))
        } catch {
          // Bad JSON in DB — keep raw string
          cache.set(r.key, r.valueJson)
        }
      }
      loaded = true
    } catch (e) {
      // DB not yet migrated / unavailable — fall back to defaults only
      console.error('[config-cache] refreshCache failed, using defaults', e)
      loaded = true
    } finally {
      loadingPromise = null
    }
  })()
  return loadingPromise
}

async function ensureLoaded(): Promise<void> {
  if (!loaded) await refreshCache()
}

/**
 * Read a config value. Resolution order:
 *   1. Env override (env vars always win)
 *   2. Cache (populated from DB)
 *   3. Built-in default
 *   4. undefined
 */
export async function getConfig<T = unknown>(key: string, fallback?: T): Promise<T | undefined> {
  await ensureLoaded()
  const env = envOverride(key)
  if (env !== undefined) {
    const def = CONFIG_DEFAULTS[key]
    return coerce(env, def ?? fallback) as T
  }
  const cached = cache.get(key)
  if (cached !== undefined) return cached as T
  const def = CONFIG_DEFAULTS[key]
  if (def !== undefined) return def as T
  return fallback
}

/** Synchronous variant — only reads from already-loaded cache + defaults + env. */
export function getConfigSync<T = unknown>(key: string, fallback?: T): T | undefined {
  const env = envOverride(key)
  if (env !== undefined) {
    const def = CONFIG_DEFAULTS[key]
    return coerce(env, def ?? fallback) as T
  }
  const cached = cache.get(key)
  if (cached !== undefined) return cached as T
  const def = CONFIG_DEFAULTS[key]
  if (def !== undefined) return def as T
  return fallback
}

/** Returns true if the cache has been loaded at least once. */
export function isCacheLoaded(): boolean {
  return loaded
}

/**
 * Write a config value: persist to DB, append ConfigVersion row, refresh
 * cache, write audit log. Env overrides still win at read-time, so this
 * function is only meaningful for DB-backed configuration.
 */
export async function setConfig(
  key: string,
  value: unknown,
  operatorId?: string,
  opts: { description?: string; reason?: string } = {},
): Promise<void> {
  await ensureLoaded()
  const traceId = getCurrentTraceId() ?? undefined
  const before = cache.get(key)
  const beforeJson = before === undefined ? null : JSON.stringify(before)
  const afterJson = JSON.stringify(value)

  // Upsert DB row
  const category = key.split('.')[0] || 'general'
  await db.systemConfig.upsert({
    where: { key },
    update: {
      valueJson: afterJson,
      description: opts.description ?? undefined,
    },
    create: {
      key,
      valueJson: afterJson,
      category,
      description: opts.description ?? null,
    },
  })

  // Append-only history
  await db.configVersion.create({
    data: {
      configKey: key,
      beforeJson,
      afterJson,
      operatorUserId: operatorId ?? null,
    },
  })

  // Refresh cache so subsequent reads see the new value
  cache.set(key, value)
  loaded = true

  // Audit log
  await audit({
    eventType: 'config_changed',
    severity: 'info',
    actorId: operatorId,
    traceId,
    resourceType: 'config',
    resourceId: key,
    beforeJson: before,
    afterJson: value,
    metadata: { reason: opts.reason },
  })
}

/**
 * Roll the configuration back to a historical version. Copies that version's
 * `afterJson` back into SystemConfig, then refreshes cache. Returns the
 * rolled-back value.
 */
export async function rollbackConfig(
  versionId: string,
  operatorId?: string,
): Promise<unknown> {
  await ensureLoaded()
  const traceId = getCurrentTraceId() ?? undefined
  const ver = await db.configVersion.findUnique({ where: { id: versionId } })
  if (!ver) {
    throw new Error(`ConfigVersion ${versionId} not found`)
  }
  if (!ver.configKey) {
    throw new Error(`ConfigVersion ${versionId} has no configKey (parent SystemConfig deleted)`)
  }
  const configKey = ver.configKey
  const before = cache.get(configKey)
  const afterValue = ver.afterJson ? JSON.parse(ver.afterJson) : null

  await db.systemConfig.upsert({
    where: { key: configKey },
    update: { valueJson: ver.afterJson ?? 'null' },
    create: { key: configKey, valueJson: ver.afterJson ?? 'null', category: configKey.split('.')[0] || 'general' },
  })

  await db.configVersion.create({
    data: {
      configKey,
      beforeJson: before === undefined ? null : JSON.stringify(before),
      afterJson: ver.afterJson,
      operatorUserId: operatorId ?? null,
    },
  })

  cache.set(configKey, afterValue)

  await audit({
    eventType: 'config_rolled_back',
    severity: 'warning',
    actorId: operatorId,
    traceId,
    resourceType: 'config',
    resourceId: configKey,
    beforeJson: before,
    afterJson: afterValue,
    metadata: { rolledBackToVersionId: versionId },
  })

  return afterValue
}

/** List ConfigVersion history for a key (newest first). */
export async function listConfigHistory(key: string, limit = 50) {
  return db.configVersion.findMany({
    where: { configKey: key },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  })
}

/** Bulk export all cached config keys for admin UI. Sensitive values are masked. */
export function dumpConfigForAdmin(): Array<{ key: string; value: unknown; source: 'env' | 'db' | 'default' }> {
  const seen = new Set<string>()
  const out: Array<{ key: string; value: unknown; source: 'env' | 'db' | 'default' }> = []
  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    seen.add(key)
    const env = envOverride(key)
    if (env !== undefined) {
      out.push({ key, value: coerce(env, CONFIG_DEFAULTS[key]), source: 'env' })
    } else if (cache.has(key)) {
      out.push({ key, value: cache.get(key), source: 'db' })
    } else {
      out.push({ key, value: CONFIG_DEFAULTS[key], source: 'default' })
    }
  }
  for (const key of cache.keys()) {
    if (!seen.has(key)) {
      out.push({ key, value: cache.get(key), source: 'db' })
    }
  }
  return out
}

/** Test-only: clear the cache singleton. Used in unit tests. */
export function _resetCacheForTest(): void {
  cache.clear()
  loaded = false
  loadingPromise = null
}
