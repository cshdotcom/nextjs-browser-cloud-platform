import { db } from '@/lib/db'

// In-memory rate limiter for per-IP and per-identifier brute force protection.
// Entries: key -> { count, firstAttemptAt }
const buckets = new Map<string, { count: number; first: number }>()

const SWEEP_INTERVAL = 5 * 60 * 1000
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return
  lastSweep = now
  for (const [k, v] of buckets) {
    if (now - v.first > 3600 * 1000) buckets.delete(k)
  }
}

export interface RateLimitResult {
  ok: boolean
  retryAfterMs: number
  remaining: number
}

// Generic fixed-window rate limit (max requests per windowMs)
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const existing = buckets.get(key)
  if (!existing || now - existing.first > windowMs) {
    buckets.set(key, { count: 1, first: now })
    return { ok: true, retryAfterMs: 0, remaining: max - 1 }
  }
  existing.count++
  if (existing.count > max) {
    return { ok: false, retryAfterMs: windowMs - (now - existing.first), remaining: 0 }
  }
  return { ok: true, retryAfterMs: 0, remaining: max - existing.count }
}

// Per-IP login brute-force protection: 20 attempts / 5 min window
export function checkLoginIpRateLimit(ip: string): RateLimitResult {
  return rateLimit(`login:ip:${ip}`, 20, 5 * 60 * 1000)
}

// Per-identifier (email/username) login brute force: 10 attempts / 5 min
export function checkLoginIdentifierRateLimit(identifier: string): RateLimitResult {
  return rateLimit(`login:id:${identifier.toLowerCase()}`, 10, 5 * 60 * 1000)
}

// Email code sending rate limit per email: configurable (default 60s gap, 10/hour)
export function checkEmailCodeSendRateLimit(email: string, gapSeconds: number, maxPerHour: number): RateLimitResult {
  const gap = rateLimit(`emailcode:gap:${email.toLowerCase()}`, 1, gapSeconds * 1000)
  if (!gap.ok) return gap
  return rateLimit(`emailcode:hour:${email.toLowerCase()}`, maxPerHour, 3600 * 1000)
}

// 2FA verification attempt rate limit per user
export function checkTwoFactorRateLimit(userId: string): RateLimitResult {
  return rateLimit(`2fa:${userId}`, 10, 5 * 60 * 1000)
}

// Password reset request rate limit per email
export function checkPasswordResetRateLimit(email: string): RateLimitResult {
  return rateLimit(`pwreset:${email.toLowerCase()}`, 5, 3600 * 1000)
}

export function clearRateLimit(key: string) {
  buckets.delete(key)
}

// Export for status / introspection
export function getRateLimitStats() {
  return Array.from(buckets.entries()).map(([k, v]) => ({ key: k, count: v.count, first: v.first }))
}
