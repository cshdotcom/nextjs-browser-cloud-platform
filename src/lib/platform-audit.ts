import 'server-only'
import { db } from '@/lib/db'
import { getClientIp } from '@/lib/crypto'
import { getCurrentTraceId } from '@/lib/trace'

/**
 * Platform-wide business audit log writer.
 *
 * Distinct from `src/lib/audit.ts` (which writes SecurityAuditLog rows for
 * auth/security events). This module writes to the APPEND-ONLY `AuditLog`
 * table that covers all business mutations: user CRUD, group CRUD, workspace
 * lifecycle, singbox orchestration, proxy/node management, config changes,
 * file uploads, token rotations, etc.
 *
 * Application code MUST NEVER issue `prisma.auditLog.update()` or
 * `prisma.auditLog.delete()` — the AuditLog table is append-only at the
 * application layer (SQLite has no native append-only constraint).
 */

export interface AuditEntry {
  /** Logged-in user id performing the operation. null for system / cron. */
  operatorId?: string | null
  /** Denormalized operator name (survives user deletion). */
  operatorName?: string
  /** create | update | delete | login | logout | export | import | run | etc. */
  operationType: string
  /** user | group | workspace | proxy | singbox | config | template | ... */
  resourceType: string
  /** id of the affected resource. null for global operations. */
  resourceId?: string | null
  /** Original Request, used to capture clientIp. */
  req?: Request
  /** JSON snapshot before mutation. */
  beforeJson?: unknown
  /** JSON snapshot after mutation. */
  afterJson?: unknown
  /** Explicit trace id (falls back to AsyncLocalStorage). */
  traceId?: string
}

export async function platformAudit(entry: AuditEntry): Promise<void> {
  try {
    const traceId = entry.traceId ?? getCurrentTraceId() ?? null
    const operatorName = entry.operatorName ?? 'system'
    await db.auditLog.create({
      data: {
        traceId,
        operatorUserId: entry.operatorId ?? null,
        operatorName,
        operationType: entry.operationType,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        clientIp: entry.req ? getClientIp(entry.req) : null,
        beforeJson:
          entry.beforeJson === undefined ? null : JSON.stringify(entry.beforeJson),
        afterJson:
          entry.afterJson === undefined ? null : JSON.stringify(entry.afterJson),
      },
    })
  } catch (e) {
    // Audit log failures MUST NOT crash the request
    console.error('[platformAudit] failed to write AuditLog row', e)
  }
}

/**
 * Convenience: denormalize operator display name from a User row.
 * Pass the user object (or null) and we'll return a human-readable label.
 */
export function operatorDisplayName(user: {
  displayName?: string | null
  username?: string
  email?: string
} | null): string {
  if (!user) return 'system'
  return user.displayName || user.username || user.email || 'unknown'
}
