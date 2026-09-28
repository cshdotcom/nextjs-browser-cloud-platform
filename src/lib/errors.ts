import 'server-only'
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Standardized error framework for the enterprise platform.
 *
 * Every error carries:
 *   - code        stable machine-readable string (e.g. "AUTH_REQUIRED")
 *   - msg         human-readable message (zh-CN by convention here)
 *   - traceId     request-scoped trace id, propagated from middleware
 *   - httpStatus  HTTP status to return
 *
 * `toResponse(err, traceId)` is the single serialization point used by
 * wrapHandler (Route Handler) and wrapAction (Server Action).
 *
 * Standard JSON envelope:
 *   { ok: false, code, msg, data: null, traceId }
 *
 * On the success path callers should use `ok(data)` which mirrors the same
 * envelope: { ok: true, code: 'OK', msg: '', data, traceId }.
 */

// ---------------- Error codes ----------------
export const ErrorCode = {
  // auth
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_2FA_REQUIRED: 'AUTH_2FA_REQUIRED',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  // permission
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PERMISSION_OWNERSHIP: 'PERMISSION_OWNERSHIP',
  // validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD: 'VALIDATION_MISSING_FIELD',
  // quota
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  QUOTA_RESERVED: 'QUOTA_RESERVED',
  // external api
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  EXTERNAL_API_TIMEOUT: 'EXTERNAL_API_TIMEOUT',
  EXTERNAL_API_UNAVAILABLE: 'EXTERNAL_API_UNAVAILABLE',
  // misc
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  IDEMPOTENCY_REPLAY: 'IDEMPOTENCY_REPLAY',
  MAINTENANCE: 'MAINTENANCE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

// ---------------- Base BizError ----------------
export interface SerializedError {
  ok: false
  code: string
  msg: string
  /** Carries structured error details (e.g. Zod `issues`) or null. */
  data: unknown
  traceId: string
}

export class BizError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly traceId?: string
  readonly data?: unknown

  constructor(
    msg: string,
    opts: {
      code?: string
      httpStatus?: number
      traceId?: string
      data?: unknown
      cause?: unknown
    } = {},
  ) {
    super(msg, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'BizError'
    this.code = opts.code ?? ErrorCode.INTERNAL_ERROR
    this.httpStatus = opts.httpStatus ?? 400
    this.traceId = opts.traceId
    this.data = opts.data
  }
}

// ---------------- Specialized errors ----------------

export class AuthError extends BizError {
  constructor(
    msg = '未登录或会话已过期',
    opts: { code?: string; httpStatus?: number; traceId?: string; data?: unknown; cause?: unknown } = {},
  ) {
    super(msg, {
      code: opts.code ?? ErrorCode.AUTH_REQUIRED,
      httpStatus: opts.httpStatus ?? 401,
      traceId: opts.traceId,
      data: opts.data,
      cause: opts.cause,
    })
    this.name = 'AuthError'
  }
}

export class PermissionError extends BizError {
  constructor(
    msg = '无权限执行此操作',
    opts: { code?: string; httpStatus?: number; traceId?: string; data?: unknown; cause?: unknown } = {},
  ) {
    super(msg, {
      code: opts.code ?? ErrorCode.PERMISSION_DENIED,
      httpStatus: opts.httpStatus ?? 403,
      traceId: opts.traceId,
      data: opts.data,
      cause: opts.cause,
    })
    this.name = 'PermissionError'
  }
}

export class ValidationError extends BizError {
  constructor(
    msg = '参数校验失败',
    opts: { code?: string; httpStatus?: number; traceId?: string; data?: unknown; cause?: unknown } = {},
  ) {
    super(msg, {
      code: opts.code ?? ErrorCode.VALIDATION_FAILED,
      httpStatus: opts.httpStatus ?? 422,
      traceId: opts.traceId,
      data: opts.data,
      cause: opts.cause,
    })
    this.name = 'ValidationError'
  }
}

export class QuotaError extends BizError {
  readonly resource: string
  readonly used: number
  readonly limit: number

  constructor(
    msg: string,
    opts: {
      resource: string
      used: number
      limit: number
      code?: string
      httpStatus?: number
      traceId?: string
      data?: unknown
      cause?: unknown
    },
  ) {
    super(msg, {
      code: opts.code ?? ErrorCode.QUOTA_EXCEEDED,
      httpStatus: opts.httpStatus ?? 429,
      traceId: opts.traceId,
      data: opts.data,
      cause: opts.cause,
    })
    this.name = 'QuotaError'
    this.resource = opts.resource
    this.used = opts.used
    this.limit = opts.limit
  }
}

export class ExternalApiError extends BizError {
  readonly upstream: string
  constructor(
    msg: string,
    opts: {
      upstream: string
      code?: string
      httpStatus?: number
      traceId?: string
      data?: unknown
      cause?: unknown
    },
  ) {
    super(msg, {
      code: opts.code ?? ErrorCode.EXTERNAL_API_ERROR,
      httpStatus: opts.httpStatus ?? 502,
      traceId: opts.traceId,
      data: opts.data,
      cause: opts.cause,
    })
    this.name = 'ExternalApiError'
    this.upstream = opts.upstream
  }
}

// ---------------- Serializer ----------------
export function toResponse(err: unknown, traceId?: string): SerializedError {
  const tid = traceId ?? (err instanceof BizError ? err.traceId : undefined) ?? generateFallbackTraceId()
  if (err instanceof BizError) {
    return {
      ok: false,
      code: err.code,
      msg: err.message,
      data: null,
      traceId: err.traceId ?? tid,
    }
  }
  // Zod errors carry an `issues` array
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    return {
      ok: false,
      code: ErrorCode.VALIDATION_FAILED,
      msg: '参数校验失败',
      data: (err as { issues: unknown }).issues,
      traceId: tid,
    }
  }
  // Unknown error — never leak internals
  return {
    ok: false,
    code: ErrorCode.INTERNAL_ERROR,
    msg: '服务器内部错误，请稍后再试',
    data: null,
    traceId: tid,
  }
}

// ---------------- Success helper (mirror envelope) ----------------
export interface SerializedOk<T = unknown> {
  ok: true
  code: 'OK'
  msg: string
  data: T
  traceId: string
}

export function ok<T>(data: T, traceId?: string): SerializedOk<T> {
  return { ok: true, code: 'OK', msg: '', data, traceId: traceId ?? generateFallbackTraceId() }
}

// ---------------- Async wrappers ----------------

/**
 * wrapHandler - for Route Handlers (app/api/.../route.ts).
 * Returns a NextResponse with the standard envelope. Never throws to the
 * Next.js runtime. Catches BizError, Zod errors, and unknown errors.
 */
export function wrapHandler<TArgs extends unknown[]>(
  fn: (req: Request, ...args: TArgs) => Promise<unknown>,
): (req: Request, ...args: TArgs) => Promise<NextResponse> {
  return async (req: Request, ...args: TArgs) => {
    const traceId = getTraceFromRequest(req)
    try {
      const result = await fn(req, ...args)
      if (result instanceof NextResponse) return result
      return NextResponse.json(ok(result, traceId))
    } catch (err) {
      const body = toResponse(err, traceId)
      // Log unexpected errors server-side for diagnostics
      if (!(err instanceof BizError) || err.httpStatus >= 500) {
        console.error(`[wrapHandler][${body.traceId}]`, err)
      } else {
        console.warn(`[wrapHandler][${body.traceId}] ${body.code}: ${body.msg}`)
      }
      return NextResponse.json(body, { status: (err instanceof BizError ? err.httpStatus : 500) })
    }
  }
}

/**
 * wrapAction — for Server Actions ('use server' functions).
 * Returns the standard envelope as a plain object (NOT a NextResponse),
 * since Server Actions cannot return Response objects. The caller is
 * expected to inspect `result.ok` rather than `throw`.
 */
export function wrapAction<TArgs extends unknown[], TRet>(
  fn: (...args: TArgs) => Promise<TRet>,
): (...args: TArgs) => Promise<SerializedOk<TRet> | SerializedError> {
  return async (...args: TArgs) => {
    const traceId = getCurrentTraceId() ?? generateFallbackTraceId()
    try {
      const result = await fn(...args)
      return ok(result, traceId)
    } catch (err) {
      const body = toResponse(err, traceId)
      if (!(err instanceof BizError) || err.httpStatus >= 500) {
        console.error(`[wrapAction][${body.traceId}]`, err)
      } else {
        console.warn(`[wrapAction][${body.traceId}] ${body.code}: ${body.msg}`)
      }
      return body
    }
  }
}

// ---------------- Trace fallback helpers ----------------
// These intentionally avoid an import cycle with trace.ts by reading the same
// headers / AsyncLocalStorage fallback. trace.ts will register itself as the
// source of truth at module load.

let traceIdGetter: (() => string | undefined) | null = null
let traceIdFromRequest: ((req: Request) => string) | null = null

/** Called by trace.ts on module load to register its request-scoped store. */
export function _registerTraceGetters(opts: {
  getCurrent: () => string | undefined
  fromRequest: (req: Request) => string
}): void {
  traceIdGetter = opts.getCurrent
  traceIdFromRequest = opts.fromRequest
}

function getCurrentTraceId(): string | undefined {
  try {
    return traceIdGetter?.() ?? undefined
  } catch {
    return undefined
  }
}

function getTraceFromRequest(req: Request): string {
  if (traceIdFromRequest) {
    try {
      return traceIdFromRequest(req)
    } catch {
      /* fall through */
    }
  }
  const hdr = req.headers.get('x-trace-id')
  if (hdr) return hdr
  return generateFallbackTraceId()
}

function generateFallbackTraceId(): string {
  // crypto.randomUUID is available in Node.js 16+ and is the same format as
  // trace.ts's newTraceId(). We avoid require() / dynamic imports here so
  // eslint stays happy.
  try {
    return crypto.randomUUID()
  } catch {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}
