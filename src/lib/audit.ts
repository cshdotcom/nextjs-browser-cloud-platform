import { db } from '@/lib/db'
import { getClientIp, getUserAgent } from '@/lib/crypto'
import { getCurrentTraceId } from '@/lib/trace'

export type AuditEventType =
  | 'login_success'
  | 'login_failed'
  | 'password_error'
  | 'email_code_error'
  | 'twofa_verify_success'
  | 'twofa_verify_failed'
  | 'twofa_enable'
  | 'twofa_disable'
  | 'twofa_reset_by_admin'
  | 'backup_code_used'
  | 'backup_code_regenerated'
  | 'trusted_device_added'
  | 'trusted_device_revoked'
  | 'password_change'
  | 'email_change'
  | 'device_logout'
  | 'all_devices_logout'
  | 'register'
  | 'account_locked'
  | 'account_unlocked'
  | 'admin_force_logout'
  | 'admin_reset_2fa'
  | 'admin_user_disable'
  | 'admin_security_setting_change'
  | 'api_token_created'
  | 'api_token_revoked'
  | 'api_token_auto_revoked'
  | 'forgot_password_requested'
  | 'password_reset'
  | 'anomaly_login_alert'
  | 'rate_limit_hit'
  | 'risk_rule_triggered'
  // Task 1-B: resource operation audit events (generic)
  | 'resource_created'
  | 'resource_updated'
  | 'resource_deleted'
  | 'config_changed'
  | 'config_rolled_back'
  | 'permission_granted'
  | 'permission_revoked'
  | 'quota_changed'
  | 'external_api_called'

export type AuditSeverity = 'info' | 'warning' | 'critical'

export async function audit(opts: {
  userId?: string
  actorId?: string
  eventType: AuditEventType
  severity?: AuditSeverity
  req?: Request
  metadata?: Record<string, unknown>
  /** Optional trace id. When omitted, falls back to AsyncLocalStorage trace. */
  traceId?: string
  /** Resource operation audit fields (task 1-B additions). */
  resourceType?: string
  resourceId?: string
  beforeJson?: unknown
  afterJson?: unknown
}): Promise<void> {
  try {
    const traceId = opts.traceId ?? getCurrentTraceId() ?? undefined
    const meta = { ...(opts.metadata ?? {}) }
    if (traceId) meta.traceId = traceId
    if (opts.resourceType) meta.resourceType = opts.resourceType
    if (opts.resourceId) meta.resourceId = opts.resourceId
    if (opts.beforeJson !== undefined) meta.beforeJson = opts.beforeJson
    if (opts.afterJson !== undefined) meta.afterJson = opts.afterJson

    await db.securityAuditLog.create({
      data: {
        userId: opts.userId ?? null,
        actorId: opts.actorId ?? null,
        eventType: opts.eventType,
        severity: opts.severity ?? 'info',
        ipAddress: opts.req ? getClientIp(opts.req) : null,
        userAgent: opts.req ? getUserAgent(opts.req) : null,
        metadata: JSON.stringify(meta),
      },
    })
  } catch (e) {
    console.error('[audit] failed to write log', e)
  }
}
