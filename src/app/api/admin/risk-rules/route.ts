import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { ensureDefaultRules } from '@/lib/risk-engine'

// GET /api/admin/risk-rules — list all risk rules
export async function GET() {
  await requireAdmin()
  await ensureDefaultRules()
  const rules = await db.riskRule.findMany({ orderBy: { createdAt: 'asc' } })
  return apiOk({
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      conditions: JSON.parse(r.conditions),
      action: r.action,
      enabled: r.enabled,
      fireCount: r.fireCount,
      lastFiredAt: r.lastFiredAt,
      createdAt: r.createdAt,
    })),
  })
}

// POST /api/admin/risk-rules — create a new rule
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const body = await req.json().catch(() => ({}))
  const { name, description, conditions, action, enabled } = body as {
    name?: string
    description?: string
    conditions?: Record<string, unknown>
    action?: string
    enabled?: boolean
  }
  if (!name || !action || !conditions) return apiError('参数不完整', 422)
  const validActions = ['lock_account', 'force_logout', 'disable_account', 'alert_only', 'force_password_change']
  if (!validActions.includes(action)) return apiError('无效的操作类型', 422)
  const rule = await db.riskRule.create({
    data: {
      name,
      description,
      conditions: JSON.stringify(conditions),
      action,
      enabled: enabled ?? true,
    },
  })
  return apiOk({ rule: { id: rule.id } })
}
