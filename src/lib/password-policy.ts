import { getSecuritySettings } from '@/lib/security-settings'

const WEAK_PASSWORDS = new Set([
  'password', '123456', '12345678', '123456789', 'qwerty', 'abc123',
  '111111', '000000', '123123', 'admin', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'login', 'passw0rd', 'p@ssword',
  'iloveyou', 'sunshine', 'princess', 'football', 'shadow', 'superman',
])

export interface PasswordValidationResult {
  ok: boolean
  reasons: string[]
  score: number // 0-4 strength score
}

export async function validatePassword(
  plain: string,
  userInputs: string[] = []
): Promise<PasswordValidationResult> {
  const settings = await getSecuritySettings()
  const reasons: string[] = []

  if (plain.length < settings.passwordMinLength) {
    reasons.push(`密码长度至少 ${settings.passwordMinLength} 位`)
  }
  if (settings.passwordRequireUppercase && !/[A-Z]/.test(plain)) {
    reasons.push('必须包含大写字母')
  }
  if (settings.passwordRequireLowercase && !/[a-z]/.test(plain)) {
    reasons.push('必须包含小写字母')
  }
  if (settings.passwordRequireDigit && !/[0-9]/.test(plain)) {
    reasons.push('必须包含数字')
  }
  if (settings.passwordRequireSpecial && !/[^A-Za-z0-9]/.test(plain)) {
    reasons.push('必须包含特殊符号')
  }
  if (settings.passwordBlockWeakDictionary) {
    const lower = plain.toLowerCase()
    if (WEAK_PASSWORDS.has(lower)) {
      reasons.push('该密码属于弱密码字典，请更换')
    }
    // also block if password contains email/name parts
    for (const input of userInputs) {
      if (input && input.length >= 4 && lower.includes(input.toLowerCase().slice(0, Math.min(input.length, 8)))) {
        reasons.push('密码不能包含账号相关信息')
        break
      }
    }
  }

  // strength score (0-4)
  let score = 0
  if (plain.length >= 8) score++
  if (plain.length >= 12) score++
  if (/[A-Z]/.test(plain) && /[a-z]/.test(plain)) score++
  if (/[0-9]/.test(plain) && /[^A-Za-z0-9]/.test(plain)) score++

  return { ok: reasons.length === 0, reasons, score }
}

export function passwordStrengthLabel(score: number): { label: string; color: string } {
  switch (score) {
    case 0:
    case 1:
      return { label: '弱', color: 'bg-red-500' }
    case 2:
      return { label: '一般', color: 'bg-orange-500' }
    case 3:
      return { label: '较强', color: 'bg-yellow-500' }
    case 4:
      return { label: '强', color: 'bg-emerald-500' }
    default:
      return { label: '弱', color: 'bg-red-500' }
  }
}
