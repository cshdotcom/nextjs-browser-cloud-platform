import { generateSecret, generateSync, verifySync, generateURI, createGuardrails } from 'otplib'

// otplib v13 uses a functional API. We configure guardrails to allow ±1 step drift.
const guardrails = createGuardrails({ minEpoch: 0 })

const BASE_OPTS = {
  digits: 6,
  period: 30,
  algorithm: 'sha1' as const,
  // epoch tolerance: allow ±30s drift (one step each side). v13 uses epochTolerance in seconds.
  epochTolerance: 30,
  guardrails,
}

// Generate a new TOTP secret (base32)
export function generateTotpSecret(): string {
  return generateSecret({ length: 32 })
}

// Build the otpauth:// URI for QR codes
export function buildTotpUri(email: string, secret: string, issuer = 'Z.ai Secure'): string {
  return generateURI({
    issuer,
    label: email,
    secret,
    algorithm: 'sha1',
    digits: 6,
    period: 30,
  })
}

// Generate the current TOTP token (for testing / dev mail)
export function generateCurrentToken(secret: string): string {
  return generateSync({ secret, ...BASE_OPTS })
}

// Verify a 6-digit TOTP token (constant-time internally via HMAC compare)
export function verifyTotp(token: string, secret: string): boolean {
  try {
    const clean = token.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(clean)) return false
    return verifySync({ token: clean, secret, ...BASE_OPTS })
  } catch {
    return false
  }
}
