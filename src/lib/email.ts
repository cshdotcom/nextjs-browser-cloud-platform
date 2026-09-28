import { db } from '@/lib/db'

// Email service. In production this would integrate with SMTP/SES/SendGrid.
// For this environment we log to console AND persist to DB so the user/admin
// can read the code from the in-app "dev mail inbox" (visible in admin panel).

export interface OutboundEmail {
  to: string
  subject: string
  body: string
  code?: string // the verification code, if any
}

export async function sendEmail(email: OutboundEmail): Promise<void> {
  // Always console-log so dev.log captures it
  console.log(`[EMAIL] to=${email.to} subject=${email.subject} code=${email.code ?? '-'}`)
  console.log(email.body)
  // Persist to EmailVerificationCode already (caller) - nothing else needed here.
  // If a real SMTP is configured we would transport here.
}

// Convenience: send a verification code email
export async function sendVerificationCodeEmail(to: string, code: string, purpose: string): Promise<void> {
  const purposeLabel: Record<string, string> = {
    login: '登录验证码',
    register: '注册激活验证码',
    'forgot-password': '重置密码验证码',
    'change-email': '更换邮箱验证码',
  }
  await sendEmail({
    to,
    subject: `[Z.ai Secure] ${purposeLabel[purpose] ?? '验证码'}：${code}`,
    body: `您的${purposeLabel[purpose] ?? '验证码'}是：${code}\n\n该验证码 5 分钟内有效，一次性使用，请勿向他人泄露。\n如非本人操作请忽略此邮件。`,
    code,
  })
}

// Anomaly login alert
export async function sendAnomalyAlertEmail(to: string, detail: string): Promise<void> {
  await sendEmail({
    to,
    subject: `[安全提醒] 检测到您的账号存在异地/陌生设备登录`,
    body: `我们检测到您的账号出现了一次可疑登录：\n\n${detail}\n\n如果是您本人操作可忽略此邮件；如非本人请立即登录修改密码并检查登录设备列表。`,
  })
}
