import { NextRequest, NextResponse } from 'next/server'
import { generateCaptcha, CAPTCHA_TTL_MS } from '@/lib/captcha'

// GET /api/captcha — generate a new captcha challenge
// Returns: { token (signed), svg (image), ttlSeconds }
export async function GET() {
  const { token, svg } = generateCaptcha()
  return NextResponse.json({
    ok: true,
    token,
    svg,
    ttlSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
  })
}
