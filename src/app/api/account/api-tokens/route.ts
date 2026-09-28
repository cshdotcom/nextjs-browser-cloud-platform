import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { generateApiToken } from '@/lib/crypto'
import { audit } from '@/lib/audit'

// GET /api/account/api-tokens — list current user's API tokens (never return the raw token again)
export async function GET() {
  const s = await requireAuth()
  const tokens = await db.apiToken.findMany({
    where: { userId: s.uid, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  return apiOk({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      scopes: t.scopes ? JSON.parse(t.scopes) : [],
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
    })),
  })
}

// POST /api/account/api-tokens — create a new API token; returns the raw token ONCE
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { name, scopes } = body as { name?: string; scopes?: string[] }
  if (!name) return apiError('请输入 Token 名称', 422)
  const { token, prefix, hash } = generateApiToken()
  const created = await db.apiToken.create({
    data: {
      userId: s.uid,
      name,
      tokenHash: hash,
      prefix,
      scopes: scopes ? JSON.stringify(scopes) : null,
    },
  })
  await audit({ userId: s.uid, eventType: 'api_token_created', req, metadata: { tokenId: created.id, name } })
  return apiOk({ token, prefix, id: created.id }) // raw token returned ONCE
}
