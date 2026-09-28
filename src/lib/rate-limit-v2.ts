import 'server-only'
import { getConfig } from '@/lib/config-cache'

/**
 * LRU-based rate limiter (v2).
 *
 * Improvements over the legacy rate-limit.ts:
 *   - LRU eviction: the store has a hard cap (DEFAULT_MAX_ENTRIES) so memory
 *     can't grow unboundedly in long-running processes.
 *   - Reads thresholds from config-cache (admin can tune without redeploy).
 *   - Three preset modes for the common platform scenarios.
 *
 * NOT multi-instance safe. For horizontal scaling, replace the in-memory
 * Map with a Redis backend (same `rateLimit(key, max, windowMs)` signature).
 */

// ---------------- Bucket ----------------
interface Bucket {
  count: number
  first: number // first attempt timestamp in the current window
}

const DEFAULT_MAX_ENTRIES = 50_000
const SWEEP_INTERVAL_MS = 5 * 60 * 1000 // 5 min
const MAX_TTL_MS = 24 * 3600 * 1000 // entries older than 24h get swept

// LRU-ordered map: most recently used at the tail. We use a plain Map since
// JS Map preserves insertion order, so re-insert on access keeps LRU fresh.
const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

function touch(key: string, bucket: Bucket): void {
  // Move to end (most-recently-used)
  buckets.delete(key)
  buckets.set(key, bucket)
}

function evictIfNeeded(): void {
  while (buckets.size > DEFAULT_MAX_ENTRIES) {
    // Evict the oldest entry (first key in insertion order)
    const firstKey = buckets.keys().next().value
    if (firstKey === undefined) break
    buckets.delete(firstKey)
  }
}

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [k, v] of buckets) {
    if (now - v.first > MAX_TTL_MS) buckets.delete(k)
  }
}

// ---------------- Core API ----------------
export interface RateLimitResult {
  ok: boolean
  retryAfterMs: number
  remaining: number
  /** Current count in the window (informational). */
  count: number
  /** Max allowed in the window. */
  limit: number
}

/**
 * Generic fixed-window rate limit. `max` requests are allowed per `windowMs`
 * window. Once exceeded, subsequent requests return ok=false with a
 * retryAfterMs hint.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const existing = buckets.get(key)
  if (!existing || now - existing.first > windowMs) {
    const fresh: Bucket = { count: 1, first: now }
    buckets.set(key, fresh)
    evictIfNeeded()
    return { ok: true, retryAfterMs: 0, remaining: max - 1, count: 1, limit: max }
  }
  touch(key, existing)
  existing.count++
  if (existing.count > max) {
    const retryAfterMs = Math.max(0, windowMs - (now - existing.first))
    return { ok: false, retryAfterMs, remaining: 0, count: existing.count, limit: max }
  }
  return {
    ok: true,
    retryAfterMs: 0,
    remaining: max - existing.count,
    count: existing.count,
    limit: max,
  }
}

/** Manually clear a bucket (e.g. after a successful login → reset attempt counter). */
export function clearRateLimit(key: string): void {
  buckets.delete(key)
}

/** Inspect the limiter state — used by admin diagnostics / tests. */
export function getRateLimitStats(): Array<{ key: string; count: number; first: number }> {
  return Array.from(buckets.entries()).map(([k, v]) => ({ key: k, count: v.count, first: v.first }))
}

// ---------------- Preset modes ----------------
export type RateLimitMode = 'anonymous' | 'authenticated' | 'api-token'

interface PresetConfig {
  max: number
  windowMs: number
}

async function loadPreset(mode: RateLimitMode): Promise<PresetConfig> {
  const windowMs = (await getConfig<number>('ratelimit.windowMs', 60_000)) ?? 60_000
  switch (mode) {
    case 'anonymous': {
      const max = (await getConfig<number>('ratelimit.anonymousPerMinute', 30)) ?? 30
      return { max, windowMs }
    }
    case 'authenticated': {
      const max = (await getConfig<number>('ratelimit.authenticatedPerMinute', 120)) ?? 120
      return { max, windowMs }
    }
    case 'api-token': {
      const max = (await getConfig<number>('ratelimit.apiTokenPerMinute', 300)) ?? 300
      return { max, windowMs }
    }
  }
}

/**
 * Apply a preset rate limit.
 *   - anonymous  → key by client IP
 *   - authenticated → key by userId
 *   - api-token  → key by tokenId
 *
 * Returns the result; callers should branch on `result.ok` and respond with
 * HTTP 429 + Retry-After header when denied.
 */
export async function applyRateLimit(
  mode: RateLimitMode,
  identifier: string,
): Promise<RateLimitResult> {
  const cfg = await loadPreset(mode)
  return rateLimit(`rl:${mode}:${identifier}`, cfg.max, cfg.windowMs)
}

/**
 * Convenience: convert a RateLimitResult into HTTP-friendly headers.
 * Returns `{ 'Retry-After'?: string, 'X-RateLimit-Remaining'?: string }`.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Limit': String(result.limit),
  }
  if (!result.ok && result.retryAfterMs > 0) {
    h['Retry-After'] = String(Math.ceil(result.retryAfterMs / 1000))
  }
  return h
}
