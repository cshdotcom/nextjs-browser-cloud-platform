import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { audit } from '@/lib/audit'

// DELETE /api/account/api-tokens/[id] — revoke a token
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireAuth()
  const { id } = await ctx.params
  const token = await db.apiToken.findUnique({ where: { id } })
  if (!token) return apiError('Token 不存在', 404)
  if (token.userId !== s.uid) return apiError('无权操作', 403)
  await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } })
  await audit({ userId: s.uid, eventType: 'api_token_revoked', req, metadata: { tokenId: id, name: token.name } })
  return apiOk({ revoked: true })
}
