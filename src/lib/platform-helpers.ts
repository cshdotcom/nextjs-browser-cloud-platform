import 'server-only'
import { ValidationError } from '@/lib/errors'

/**
 * Shared helpers for platform Route Handlers.
 */

/** Parse + clamp pagination params from a URLSearchParams. */
export function parsePagination(url: URL): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20),
  )
  return { page, pageSize, skip: (page - 1) * pageSize }
}

/**
 * Parse + validate a JSON request body via a zod schema.
 * Throws ValidationError (422) on parse failure — caught by wrapHandler.
 */
export async function parseBody<T>(
  req: Request,
  schema: { parse: (input: unknown) => T; safeParse?: (input: unknown) => { success: boolean; error?: { issues: unknown[] }; data?: T } },
): Promise<T> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ValidationError('请求体不是合法 JSON', { code: 'VALIDATION_FAILED' })
  }
  if (schema.safeParse) {
    const r = schema.safeParse(body)
    if (!r.success) {
      throw new ValidationError('参数校验失败', {
        code: 'VALIDATION_FAILED',
        data: r.error?.issues ?? null,
      })
    }
    return r.data as T
  }
  try {
    return schema.parse(body)
  } catch (e) {
    throw new ValidationError('参数校验失败', {
      code: 'VALIDATION_FAILED',
      data: e,
    })
  }
}

/**
 * Parse query params via a zod schema. Accepts a record built from
 * URLSearchParams (caller can build via Object.fromEntries).
 */
export function parseQuery<T>(
  query: Record<string, string | string[] | undefined>,
  schema: { safeParse: (input: unknown) => { success: boolean; error?: { issues: unknown[] }; data?: T } },
): T {
  const r = schema.safeParse(query)
  if (!r.success) {
    throw new ValidationError('参数校验失败', {
      code: 'VALIDATION_FAILED',
      data: r.error?.issues ?? null,
    })
  }
  return r.data as T
}

/** Build a query record from a URLSearchParams (single-value-per-key). */
export function queryRecord(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of url.searchParams.entries()) {
    out[k] = v
  }
  return out
}

/**
 * Common sort whitelist parser. Accepts `?sort=field` or `?sort=-field`
 * (descending). `allowed` is the whitelist of sortable field names.
 * Returns `{ field, direction }` or null when `sort` is absent.
 */
export function parseSort(
  url: URL,
  allowed: ReadonlySet<string>,
): { field: string; direction: 'asc' | 'desc' } | null {
  const raw = url.searchParams.get('sort')
  if (!raw) return null
  const direction: 'asc' | 'desc' = raw.startsWith('-') ? 'desc' : 'asc'
  const field = raw.replace(/^-/, '')
  if (!allowed.has(field)) {
    throw new ValidationError(`不允许按字段 ${field} 排序`, {
      code: 'VALIDATION_FAILED',
      data: { allowed: Array.from(allowed) },
    })
  }
  return { field, direction }
}

/** Whitelist of fields allowed for user list sorting. */
export const USER_SORT_FIELDS: ReadonlySet<string> = new Set([
  'createdAt',
  'lastLoginAt',
  'email',
  'username',
  'role',
  'status',
])

/** Standard pagination envelope. */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
