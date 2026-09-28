import 'server-only'

/**
 * Idempotency guard.
 *
 * `withIdempotency(key, ttlMs, fn)` ensures `fn` runs at most once per
 * `key` within the `ttlMs` window. The first call's result (or thrown
 * error) is cached and replayed to subsequent callers that pass the same
 * key.
 *
 * Typical key shape:
 *   `${userId}:${actionType}:${timestampBucket}`
 * e.g.
 *   `u-123:createWorkspace:bucket-1700000000000`
 * where `bucket-...` = a 60-second-wide bucket computed from the request
 * timestamp so the client can safely retry within that window without
 * spawning duplicate resources.
 *
 * Storage is an in-process LRU Map. For multi-instance deployments, replace
 * the implementation with a Redis SETNX + EXPIRE backend (same signature).
 */

interface CachedResult {
  // Marker for success vs failure
  state: 'pending' | 'resolved' | 'rejected'
  value?: unknown
  error?: unknown
  expiresAt: number
}

const DEFAULT_MAX_ENTRIES = 10_000
const SWEEP_INTERVAL_MS = 60_000

const store = new Map<string, CachedResult>()
let lastSweep = Date.now()

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
}

function evictIfNeeded(): void {
  while (store.size > DEFAULT_MAX_ENTRIES) {
    const firstKey = store.keys().next().value
    if (firstKey === undefined) break
    store.delete(firstKey)
  }
}

// ---------------- Public API ----------------

export interface IdempotencyOptions {
  ttlMs: number
  /** Optional logger for replay / cache-hit events. */
  onReplay?: (key: string) => void
  /** Optional logger for cache-miss events. */
  onMiss?: (key: string) => void
}

/**
 * Run `fn` exactly once for `key` within the TTL window.
 *
 *   - First caller: fn() runs. The result (or thrown error) is cached.
 *     The caller waits for the result.
 *   - Concurrent callers (same key, while fn() is still running): they
 *     wait for the first call to resolve, then receive the same result
 *     (or same thrown error). This avoids duplicate side effects.
 *   - Subsequent callers (after the first resolves, within TTL): they
 *     receive the cached result immediately.
 *
 * Note: when `fn` throws, we DO cache the error and rethrow it for
 * subsequent callers within TTL — this prevents error storms from
 * retrying a failing operation repeatedly. If the caller wants retryable
 * behaviour, they should NOT use idempotency for that call.
 */
export async function withIdempotency<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts: { onReplay?: (key: string) => void; onMiss?: (key: string) => void } = {},
): Promise<T> {
  if (!key || typeof key !== 'string') {
    throw new Error('withIdempotency: key must be a non-empty string')
  }
  const now = Date.now()
  sweep(now)

  const existing = store.get(key)
  if (existing) {
    if (existing.expiresAt > now) {
      // Cache hit — wait for resolution
      if (existing.state === 'pending') {
        return waitForPending<T>(key, existing, ttlMs)
      }
      opts.onReplay?.(key)
      if (existing.state === 'rejected') {
        throw existing.error
      }
      return existing.value as T
    }
    // Expired — clear and re-run
    store.delete(key)
  }

  // Cache miss — start the work
  opts.onMiss?.(key)
  const entry: CachedResult = {
    state: 'pending',
    expiresAt: now + ttlMs,
  }
  store.set(key, entry)
  evictIfNeeded()

  // Pending waiters (other concurrent callers)
  const waiters: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> = (entry as CachedResult & { waiters?: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> }).waiters ?? []
  ;(entry as CachedResult & { waiters?: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> }).waiters = waiters

  try {
    const value = await fn()
    entry.state = 'resolved'
    entry.value = value
    // Wake waiters
    for (const w of waiters) w.resolve(value)
    return value
  } catch (e) {
    entry.state = 'rejected'
    entry.error = e
    // Wake waiters with the same error
    for (const w of waiters) w.reject(e)
    throw e
  }
}

function waitForPending<T>(key: string, entry: CachedResult, _ttlMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const waiters = (entry as CachedResult & { waiters?: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> }).waiters ?? []
    ;(entry as CachedResult & { waiters?: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> }).waiters = waiters
    waiters.push({ resolve, reject })
    // We rely on the original fn() promise to settle; if it never settles,
    // the entry's TTL will eventually evict it. The waiter will hang until
    // then. (In production a stricter timeout should be applied.)
    void key
  })
}

/**
 * Peek at the cached result for `key` without running anything. Returns
 * { state, expiresAt } or null if no entry exists.
 */
export function peekIdempotency(key: string): { state: 'pending' | 'resolved' | 'rejected'; expiresAt: number } | null {
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) return null
  return { state: entry.state, expiresAt: entry.expiresAt }
}

/** Manually clear the cached result for `key` (e.g. for tests / admin reset). */
export function clearIdempotency(key: string): boolean {
  return store.delete(key)
}

/** Test-only: clear all cached results. */
export function clearAllIdempotency(): void {
  store.clear()
}

/** Compute a TTL bucket key for a given timestamp. Bucket width = bucketMs. */
export function bucketKey(timestampMs: number, bucketMs: number): string {
  const bucket = Math.floor(timestampMs / bucketMs)
  return `bucket-${bucket}`
}

/**
 * Helper: build a standard idempotency key.
 *   `${userId}:${actionType}:${bucketKey(ts, bucketMs)}`
 */
export function buildIdempotencyKey(
  userId: string,
  actionType: string,
  timestampMs: number,
  bucketMs: number = 60_000,
): string {
  return `${userId}:${actionType}:${bucketKey(timestampMs, bucketMs)}`
}

/** Inspect cache size (diagnostics). */
export function idempotencyCacheSize(): number {
  return store.size
}
