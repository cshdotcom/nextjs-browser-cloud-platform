import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'

// PATCH /api/admin/risk-rules/[id] — update rule (enable/disable, edit)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  void admin
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { name, description, conditions, action, enabled } = body as {
    name?: string
    description?: string
    conditions?: Record<string, unknown>
    action?: string
    enabled?: boolean
  }
  const patch: Record<string, unknown> = {}
  if (name !== undefined) patch.name = name
  if (description !== undefined) patch.description = description
  if (conditions !== undefined) patch.conditions = JSON.stringify(conditions)
  if (action !== undefined) patch.action = action
  if (enabled !== undefined) patch.enabled = enabled
  const updated = await db.riskRule.update({ where: { id }, data: patch })
  return apiOk({ rule: { id: updated.id, enabled: updated.enabled } })
}

// DELETE /api/admin/risk-rules/[id]
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  void admin
  void req
  const { id } = await ctx.params
  await db.riskRule.delete({ where: { id } })
  return apiOk({ deleted: true })
}
