import 'server-only'
import { db } from '@/lib/db'
import { QuotaError, ValidationError } from '@/lib/errors'
import { audit } from '@/lib/audit'
import { getCurrentTraceId } from '@/lib/trace'

/**
 * Quota checker.
 *
 * A quota is the hard upper bound for a `resource` (e.g. browser_workspace
 * sessions, singbox CPU, storage bytes) within a `scope` (global / user /
 * group). The platform supports 0.001 numeric precision (per the spec).
 *
 * Tables (added in task 1-B):
 *   - Quota        : (scope, scopeId, resource) → hardLimit + reserved
 *   - QuotaUsage    : (scope, scopeId, resource) → used
 *
 * The "reserved" field is a safety margin that's always kept free. For
 * example, if hardLimit = 100 and reserved = 5, an attempt that would push
 * usage above 95 (i.e. used + amount > 100 - 5 = 95) is rejected.
 *
 * Public API:
 *   - checkQuota(scope, scopeId, resource, amount) → void (throws QuotaError)
 *   - reserveQuota(scope, scopeId, resource, amount) → increment usage
 *   - releaseQuota(scope, scopeId, resource, amount) → decrement usage
 *   - getUsage(scope, scopeId, resource?) → current usage stats
 *   - setQuota(scope, scopeId, resource, hardLimit, reserved, operatorId)
 *     → admin set / update
 *
 * Resolution precedence for "effective hard limit":
 *   1. user-scope row, if present
 *   2. group-scope row (for the user's group), if present
 *   3. global-scope row, if present
 *
 * Whichever is the most restrictive wins (min of applicable limits). Same
 * for usage: a user's check is constrained by user + group + global caps.
 *
 * If no Quota row exists for a given scope/resource, we fall back to a
 * generous default (Infinity) so the platform is usable out of the box.
 */

export type QuotaScope = 'global' | 'user' | 'group'

export type QuotaResource =
  | 'browser_workspace'
  | 'novnc_workspace'
  | 'singbox_cpu'
  | 'singbox_memory'
  | 'storage_bytes'
  | 'api_calls_per_day'
  | string

export interface QuotaCheckOpts {
  /** When scope='user', also enforce group + global limits. */
  enforceHierarchy?: boolean
  /** Operator id for audit logging on the rejection. */
  actorId?: string
  /** Trace id (falls back to AsyncLocalStorage). */
  traceId?: string
}

export interface UsageInfo {
  scope: QuotaScope
  scopeId: string
  resource: string
  used: number
  hardLimit: number
  reserved: number
  effectiveLimit: number // hardLimit - reserved
  remaining: number // effectiveLimit - used
  percentUsed: number // 0..100+
}

// ---------------- Internal helpers ----------------
async function getQuotaRow(scope: QuotaScope, scopeId: string, resource: string) {
  return db.quota.findUnique({
    where: {
      scope_scopeId_resource: { scope, scopeId, resource },
    },
  })
}

async function getUsageRow(scope: QuotaScope, scopeId: string, resource: string) {
  return db.quotaUsage.findUnique({
    where: {
      scope_scopeId_resource: { scope, scopeId, resource },
    },
  })
}

function defaultHardLimit(resource: string): number {
  // Generous defaults so the platform is usable with no Quota rows yet.
  switch (resource) {
    case 'browser_workspace':
    case 'novnc_workspace':
      return 100
    case 'singbox_cpu':
      return 64
    case 'singbox_memory':
      return 65536 // MiB
    case 'storage_bytes':
      return 10 * 1024 * 1024 * 1024 // 10 GiB
    case 'api_calls_per_day':
      return 100_000
    default:
      return Number.POSITIVE_INFINITY
  }
}

async function ensureUsageRow(scope: QuotaScope, scopeId: string, resource: string) {
  // Upsert an empty usage counter if missing
  await db.quotaUsage.upsert({
    where: {
      scope_scopeId_resource: { scope, scopeId, resource },
    },
    update: {},
    create: { scope, scopeId, resource, used: 0 },
  })
}

// ---------------- Public API ----------------

/**
 * Check whether consuming `amount` more of `resource` in `(scope, scopeId)`
 * would stay within the limit (hardLimit - reserved). Throws QuotaError if
 * it would exceed. Returns the effective UsageInfo on success.
 *
 * `amount` defaults to 1. Use 0.001-precision floats where the resource is
 * fractional (e.g. singbox_cpu cores).
 *
 * When scope='user' and `enforceHierarchy` is true (default), we ALSO check
 * the user's group limit and the global limit. The most-restrictive remaining
 * capacity wins.
 */
export async function checkQuota(
  scope: QuotaScope,
  scopeId: string,
  resource: string,
  amount = 1,
  opts: QuotaCheckOpts = {},
): Promise<UsageInfo> {
  if (amount < 0) {
    throw new ValidationError('checkQuota amount 必须 >= 0', { code: 'VALIDATION_FAILED' })
  }
  const traceId = opts.traceId ?? getCurrentTraceId() ?? undefined

  // Build the chain of effective limits to check
  const chain: Array<{ scope: QuotaScope; scopeId: string }> = [{ scope, scopeId }]
  if (opts.enforceHierarchy !== false && scope === 'user') {
    // Add the user's group + global
    const user = await db.user.findUnique({ where: { id: scopeId }, select: { groupId: true } })
    if (user?.groupId) chain.push({ scope: 'group', scopeId: user.groupId })
    chain.push({ scope: 'global', scopeId: 'global' })
  } else if (opts.enforceHierarchy !== false && scope === 'group') {
    chain.push({ scope: 'global', scopeId: 'global' })
  }

  let mostRestrictive: UsageInfo | null = null
  for (const link of chain) {
    const usage = await computeUsage(link.scope, link.scopeId, resource)
    if (usage.used + amount > usage.effectiveLimit) {
      // Exceeded at this level
      await audit({
        eventType: 'quota_changed',
        severity: 'warning',
        actorId: opts.actorId,
        traceId,
        resourceType: 'config',
        resourceId: `${link.scope}:${link.scopeId}:${resource}`,
        metadata: {
          action: 'quota_check_rejected',
          scope: link.scope,
          scopeId: link.scopeId,
          resource,
          used: usage.used,
          amount,
          effectiveLimit: usage.effectiveLimit,
        },
      }).catch(() => {})
      throw new QuotaError(
        `配额超出：${resource} 已用 ${usage.used} / ${usage.effectiveLimit}，本次申请 ${amount}`,
        {
          resource: `${link.scope}:${resource}`,
          used: usage.used,
          limit: usage.effectiveLimit,
          traceId,
          data: { scope: link.scope, scopeId: link.scopeId },
        },
      )
    }
    if (!mostRestrictive || usage.remaining < mostRestrictive.remaining) {
      mostRestrictive = usage
    }
  }
  return mostRestrictive ?? (await computeUsage(scope, scopeId, resource))
}

/**
 * Atomically increment usage after a successful checkQuota. Callers should
 * pair this with checkQuota in a transaction when possible.
 */
export async function reserveQuota(
  scope: QuotaScope,
  scopeId: string,
  resource: string,
  amount = 1,
  opts: { actorId?: string; traceId?: string } = {},
): Promise<void> {
  if (amount === 0) return
  if (amount < 0) {
    // Negative reservation = release
    return releaseQuota(scope, scopeId, resource, -amount, opts)
  }
  await ensureUsageRow(scope, scopeId, resource)
  await db.quotaUsage.update({
    where: { scope_scopeId_resource: { scope, scopeId, resource } },
    data: { used: { increment: amount }, updatedAt: new Date() },
  })
  await audit({
    eventType: 'quota_changed',
    severity: 'info',
    actorId: opts.actorId,
    traceId: opts.traceId ?? getCurrentTraceId() ?? undefined,
    metadata: { action: 'reserve', scope, scopeId, resource, amount },
  }).catch(() => {})
}

/** Decrement usage (e.g. when a workspace is torn down). Floors at 0. */
export async function releaseQuota(
  scope: QuotaScope,
  scopeId: string,
  resource: string,
  amount = 1,
  opts: { actorId?: string; traceId?: string } = {},
): Promise<void> {
  if (amount <= 0) return
  await ensureUsageRow(scope, scopeId, resource)
  const row = await db.quotaUsage.findUnique({
    where: { scope_scopeId_resource: { scope, scopeId, resource } },
  })
  if (!row) return
  const newUsed = Math.max(0, row.used - amount)
  await db.quotaUsage.update({
    where: { scope_scopeId_resource: { scope, scopeId, resource } },
    data: { used: newUsed, updatedAt: new Date() },
  })
  await audit({
    eventType: 'quota_changed',
    severity: 'info',
    actorId: opts.actorId,
    traceId: opts.traceId ?? getCurrentTraceId() ?? undefined,
    metadata: { action: 'release', scope, scopeId, resource, amount, newUsed },
  }).catch(() => {})
}

/** Compute current usage stats for a (scope, scopeId, resource) triple. */
export async function computeUsage(
  scope: QuotaScope,
  scopeId: string,
  resource: string,
): Promise<UsageInfo> {
  const quotaRow = await getQuotaRow(scope, scopeId, resource)
  const usageRow = await getUsageRow(scope, scopeId, resource)
  const hardLimit = quotaRow?.hardLimit ?? defaultHardLimit(resource)
  const reserved = quotaRow?.reserved ?? 0
  const used = usageRow?.used ?? 0
  const effectiveLimit = Math.max(0, hardLimit - reserved)
  const remaining = effectiveLimit - used
  const percentUsed = effectiveLimit > 0 ? (used / effectiveLimit) * 100 : used > 0 ? Number.POSITIVE_INFINITY : 0
  return {
    scope,
    scopeId,
    resource,
    used,
    hardLimit,
    reserved,
    effectiveLimit,
    remaining,
    percentUsed,
  }
}

/** Convenience: get usage info across all three scopes for a given user. */
export async function getUsage(userId: string, resource?: string): Promise<UsageInfo[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { groupId: true } })
  const out: UsageInfo[] = []
  const resources: string[] = resource ? [resource] : await listAllResources()
  for (const r of resources) {
    out.push(await computeUsage('user', userId, r))
    if (user?.groupId) out.push(await computeUsage('group', user.groupId, r))
    out.push(await computeUsage('global', 'global', r))
  }
  return out
}

/** List all distinct resource types currently configured. */
export async function listAllResources(): Promise<string[]> {
  const rows = await db.quota.findMany({ select: { resource: true }, distinct: ['resource'] })
  return rows.map((r) => r.resource)
}

// ---------------- Admin: set / update quota ----------------

export async function setQuota(
  scope: QuotaScope,
  scopeId: string,
  resource: string,
  hardLimit: number,
  reserved: number = 0,
  operatorId?: string,
): Promise<void> {
  if (hardLimit < 0 || reserved < 0) {
    throw new ValidationError('hardLimit / reserved 必须 >= 0', { code: 'VALIDATION_FAILED' })
  }
  if (reserved > hardLimit) {
    throw new ValidationError('reserved 不能超过 hardLimit', { code: 'VALIDATION_FAILED' })
  }
  const traceId = getCurrentTraceId() ?? undefined

  const existing = await getQuotaRow(scope, scopeId, resource)
  const before = existing ? { hardLimit: existing.hardLimit, reserved: existing.reserved } : null

  await db.quota.upsert({
    where: { scope_scopeId_resource: { scope, scopeId, resource } },
    update: { hardLimit, reserved },
    create: { scope, scopeId, resource, hardLimit, reserved },
  })

  await audit({
    eventType: 'quota_changed',
    severity: 'warning',
    actorId: operatorId,
    traceId,
    resourceType: 'config',
    resourceId: `${scope}:${scopeId}:${resource}`,
    beforeJson: before,
    afterJson: { hardLimit, reserved },
    metadata: { action: 'set_quota', scope, scopeId, resource },
  }).catch(() => {})
}

/** Remove a quota row (reverts to default limit). */
export async function deleteQuota(
  scope: QuotaScope,
  scopeId: string,
  resource: string,
  operatorId?: string,
): Promise<void> {
  const traceId = getCurrentTraceId() ?? undefined
  const existing = await getQuotaRow(scope, scopeId, resource)
  await db.quota.deleteMany({
    where: { scope, scopeId, resource },
  })
  await audit({
    eventType: 'quota_changed',
    severity: 'warning',
    actorId: operatorId,
    traceId,
    resourceType: 'config',
    resourceId: `${scope}:${scopeId}:${resource}`,
    beforeJson: existing,
    metadata: { action: 'delete_quota', scope, scopeId, resource },
  }).catch(() => {})
}
