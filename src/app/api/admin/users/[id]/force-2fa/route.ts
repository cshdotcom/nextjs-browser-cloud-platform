import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { audit } from '@/lib/audit'

// POST /api/admin/users/[id]/force-2fa — admin force-enables 2FA requirement for a user
// (sets user's twoFactorEnabled flag — the user must complete setup on next login)
// Body: { enabled: boolean }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { enabled } = body as { enabled?: boolean }
  if (typeof enabled !== 'boolean') return apiError('参数错误', 422)
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return apiError('用户不存在', 404)
  await db.user.update({ where: { id }, data: { twoFactorEnabled: enabled } })
  await audit({ userId: id, actorId: admin.uid, eventType: enabled ? 'twofa_enable' : 'twofa_disable', severity: 'warning', req, metadata: { by: 'admin_force' } })
  return apiOk({ enabled })
}
