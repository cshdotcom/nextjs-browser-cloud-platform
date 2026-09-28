import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { sha256Hex, getClientIp, getUserAgent } from '@/lib/crypto'

const SESSION_COOKIE = 'zai_session'
const PENDING_2FA_COOKIE = 'zai_pending_2fa'

// Secret used to sign JWTs. In production MUST be set via env.
const JWT_SECRET = new TextEncoder().encode(
  (process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-please-32bytes').padEnd(32, '0').slice(0, 32)
)

export interface SessionJwtPayload {
  sid: string // session id
  uid: string // user id
  email: string
  role: string
  twofa: boolean // whether 2FA fully completed this session
  remember: boolean
  iat?: number
  exp?: number
}

// Create a session: persists DB row + signs JWT + sets HttpOnly Secure SameSite cookie
export async function createSession(opts: {
  userId: string
  email: string
  role: string
  remember: boolean
  req: Request
  twoFactorDone: boolean
  trusted?: boolean
  maxLifetimeHours: number
  idleTimeoutMinutes: number
}): Promise<{ sessionId: string; token: string }> {
  const sessionId = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + opts.maxLifetimeHours * 3600 * 1000)
  const ip = getClientIp(opts.req)
  const ua = getUserAgent(opts.req)

  const token = await new SignJWT({
    sid: sessionId,
    uid: opts.userId,
    email: opts.email,
    role: opts.role,
    twofa: opts.twoFactorDone,
    remember: opts.remember,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(JWT_SECRET)

  await db.session.create({
    data: {
      id: sessionId,
      userId: opts.userId,
      tokenHash: sha256Hex(token),
      userAgent: ua,
      ipAddress: ip,
      isTrusted: opts.trusted ?? false,
      remember: opts.remember,
      expiresAt,
      lastActiveAt: now,
    },
  })

  // set cookie: HttpOnly + Secure + SameSite=Lax (Strict breaks email link flows)
  const cookieStore = await cookies()
  const maxAge = opts.remember ? opts.maxLifetimeHours * 3600 : undefined
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' ? true : false,
    sameSite: 'lax',
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  })

  return { sessionId, token }
}

// Verify & decode the current session token. Also touches lastActiveAt and
// enforces idle timeout. Returns null if invalid/expired/revoked.
export async function getSession(): Promise<SessionJwtPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const data = payload as unknown as SessionJwtPayload
    // Check DB session still active and not revoked, and within idle timeout
    const session = await db.session.findUnique({ where: { tokenHash: sha256Hex(token) } })
    if (!session) return null
    if (session.revokedAt) return null
    if (session.expiresAt < new Date()) return null
    // idle timeout (only applies to non-remember sessions)
    if (!session.remember) {
      const idleMs = Date.now() - session.lastActiveAt.getTime()
      // We can't read SecuritySettings here synchronously per-call cheaply, so use 60 min default
      const idleLimitMs = 60 * 60 * 1000
      if (idleMs > idleLimitMs) return null
    }
    // touch lastActiveAt (fire and forget, rate-limited to once per minute)
    const minuteAgo = new Date(Date.now() - 60 * 1000)
    if (session.lastActiveAt < minuteAgo) {
      db.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } }).catch(() => {})
    }
    return data
  } catch {
    return null
  }
}

// Require an authenticated, fully-verified (post-2FA) session. Throws 401-ish.
export async function requireAuth(): Promise<SessionJwtPayload> {
  const s = await getSession()
  if (!s) throw new AuthError('未登录或会话已过期', 401)
  return s
}

export async function requireAdmin(): Promise<SessionJwtPayload> {
  const s = await requireAuth()
  if (s.role !== 'admin' && s.role !== 'superadmin') throw new AuthError('需要管理员权限', 403)
  return s
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function destroySession(req: Request): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const data = payload as unknown as SessionJwtPayload
      await db.session.update({
        where: { id: data.sid },
        data: { revokedAt: new Date() },
      })
    } catch {
      /* ignore */
    }
  }
  cookieStore.delete(SESSION_COOKIE)
}

// Kill all sessions of a user except the provided session id
export async function killOtherSessions(userId: string, keepSessionId?: string): Promise<number> {
  const sessions = await db.session.findMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) },
  })
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  })
  return sessions.length
}

export async function killAllSessions(userId: string): Promise<number> {
  const sessions = await db.session.findMany({ where: { userId, revokedAt: null } })
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  return sessions.length
}

// ---------------- Pending 2FA flow ----------------
// When password/email-code succeeds but 2FA is required, we stash a short-lived
// pending cookie that lets the user finish 2FA. It does NOT grant any access.

export async function setPending2fa(payload: { uid: string; email: string; method: string }): Promise<void> {
  const token = await new SignJWT({ ...payload, pending: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(JWT_SECRET)
  const cookieStore = await cookies()
  cookieStore.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' ? true : false,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
}

export async function getPending2fa(): Promise<{ uid: string; email: string; method: string } | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(PENDING_2FA_COOKIE)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (!payload.pending) return null
    return { uid: payload.uid as string, email: payload.email as string, method: payload.method as string }
  } catch {
    return null
  }
}

export async function clearPending2fa(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(PENDING_2FA_COOKIE)
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
