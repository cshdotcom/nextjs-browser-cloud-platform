import 'server-only'
import { getSession, SessionJwtPayload } from '@/lib/session'
import { AuthError, PermissionError } from '@/lib/errors'

/**
 * Platform auth helpers.
 *
 * The existing `src/lib/session.ts` exports a plain `Error`-based `AuthError`
 * that does NOT serialize through `wrapHandler` from `errors.ts` (it lacks the
 * `code`/`httpStatus` fields BizError requires). These wrappers re-throw as
 * the BizError-based variants so all platform routes get proper status codes.
 *
 * Use these instead of `requireAuth` / `requireAdmin` from session.ts when
 * building platform Route Handlers wrapped in `wrapHandler`.
 */

export async function requireAuth(): Promise<SessionJwtPayload> {
  const s = await getSession()
  if (!s) {
    throw new AuthError('未登录或会话已过期', { code: 'AUTH_REQUIRED', httpStatus: 401 })
  }
  return s
}

export async function requireAdmin(): Promise<SessionJwtPayload> {
  const s = await requireAuth()
  if (s.role !== 'admin' && s.role !== 'superadmin') {
    throw new PermissionError('需要管理员权限', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  return s
}

export async function requireSuperadmin(): Promise<SessionJwtPayload> {
  const s = await requireAuth()
  if (s.role !== 'superadmin') {
    throw new PermissionError('需要超级管理员权限', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  return s
}

/**
 * Validate a CRON_SECRET request header. Throws AuthError if missing/wrong.
 * Used by /api/platform/cron/route.ts to gate the cron entrypoint.
 */
export async function requireCronSecret(req: Request): Promise<void> {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    throw new AuthError('CRON_SECRET 环境变量未配置，无法触发定时任务', {
      code: 'AUTH_REQUIRED',
      httpStatus: 503,
    })
  }
  const got = req.headers.get('x-cron-secret') || req.headers.get('x-internal-secret')
  if (!got || got !== expected) {
    throw new AuthError('内部密钥无效', { code: 'AUTH_REQUIRED', httpStatus: 401 })
  }
}

export type { SessionJwtPayload }
