import { NextResponse } from 'next/server'
import { getSecuritySettings } from '@/lib/security-settings'

// GET /api/public/security-config — public-facing security flags (no sensitive data)
// Used by the auth frontend to conditionally render captcha / registration / email-code login.
export async function GET() {
  const s = await getSecuritySettings()
  return NextResponse.json({
    ok: true,
    config: {
      allowRegistration: s.allowRegistration,
      requireEmailActivation: s.requireEmailActivation,
      allowEmailCodeLogin: s.allowEmailCodeLogin,
      enableLoginCaptcha: s.enableLoginCaptcha,
      passwordMinLength: s.passwordMinLength,
    },
  })
}
