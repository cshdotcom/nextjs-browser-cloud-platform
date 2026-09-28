import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const BCRYPT_ROUNDS = 12
// 32-byte key derived from env (or dev fallback). In production this MUST be set.
const ENC_KEY = (process.env.SECRET_ENCRYPTION_KEY || 'dev-encryption-key-change-me-in-production-32b').padEnd(32, '0').slice(0, 32)

// ---------------- Password hashing (bcrypt) ----------------
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

// ---------------- Constant-time string compare (anti timing-attack) ----------------
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    // still compare to keep timing similar
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

// ---------------- AES-256-GCM encryption for TOTP secrets ----------------
export interface EncryptedPayload {
  ciphertext: string
  iv: string
  tag: string
}

export function encryptSecret(plain: string): EncryptedPayload {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENC_KEY, 'utf8'), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decryptSecret(payload: EncryptedPayload): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(ENC_KEY, 'utf8'),
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

// ---------------- Random generators ----------------
export function generateNumericCode(length = 6): string {
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += (bytes[i] % 10).toString()
  }
  return code
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

// Generate 10 backup recovery codes (8 chars, dash-separated groups)
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(5)
    const hex = bytes.toString('hex').toUpperCase() // 10 hex chars
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`)
  }
  return codes
}

// Hash a backup code for storage (bcrypt)
export async function hashBackupCode(code: string): Promise<string> {
  // normalise to upper case
  return bcrypt.hash(code.toUpperCase(), BCRYPT_ROUNDS)
}

// ---------------- Device fingerprint ----------------
export function hashDeviceFingerprint(parts: string): string {
  return crypto.createHash('sha256').update(parts).digest('hex')
}

// ---------------- IP / request helpers ----------------
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function getUserAgent(req: Request): string {
  return req.headers.get('user-agent') || 'unknown'
}

// Generate API token: prefix_readablesecret
export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(24).toString('hex')
  const prefix = raw.slice(0, 8)
  const token = `zai_${prefix}${raw.slice(8)}`
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  return { token, prefix, hash }
}

// SHA-256 hex (for token hashing)
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}
