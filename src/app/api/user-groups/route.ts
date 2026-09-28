import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'

// GET /api/user-groups — list groups
export async function GET() {
  await requireAdmin()
  const groups = await db.userGroup.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { users: true } } },
  })
  return apiOk({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      enforceTwoFactor: g.enforceTwoFactor,
      inheritGlobalTwoFactor: g.inheritGlobalTwoFactor,
      userCount: g._count.users,
      createdAt: g.createdAt,
    })),
  })
}

// POST /api/user-groups — create
export async function POST(req: NextRequest) {
  await requireAdmin()
  const body = await req.json().catch(() => ({}))
  const { name, description, enforceTwoFactor, inheritGlobalTwoFactor } = body as {
    name?: string
    description?: string
    enforceTwoFactor?: boolean
    inheritGlobalTwoFactor?: boolean
  }
  if (!name) return apiError('请输入用户组名称', 422)
  const group = await db.userGroup.create({
    data: {
      name,
      description,
      enforceTwoFactor: !!enforceTwoFactor,
      inheritGlobalTwoFactor: inheritGlobalTwoFactor ?? true,
    },
  })
  return apiOk({ group })
}
