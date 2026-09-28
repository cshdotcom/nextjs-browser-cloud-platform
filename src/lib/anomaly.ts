import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { sendAnomalyAlertEmail } from '@/lib/email'
import { getSecuritySettings } from '@/lib/security-settings'

// Detect anomaly login: new IP or new UA device for this user.
// If anomaly detection is enabled and this is a first-time IP/UA, alert the user.
export async function detectAndAlertAnomaly(opts: {
  userId: string
  email: string
  ip: string
  ua: string
  req: Request
}): Promise<void> {
  const settings = await getSecuritySettings()
  if (!settings.enableAnomalyAlert) return

  // Look at past successful logins for this user
  const prior = await db.securityAuditLog.findFirst({
    where: {
      userId: opts.userId,
      eventType: 'login_success',
      ipAddress: opts.ip,
    },
    orderBy: { createdAt: 'desc' },
  })
  const newIp = !prior

  const priorUa = await db.securityAuditLog.findFirst({
    where: {
      userId: opts.userId,
      eventType: 'login_success',
      userAgent: opts.ua,
    },
    orderBy: { createdAt: 'desc' },
  })
  const newUa = !priorUa

  if (newIp || newUa) {
    await audit({
      userId: opts.userId,
      eventType: 'anomaly_login_alert',
      severity: 'warning',
      req: opts.req,
      metadata: { ip: opts.ip, ua: opts.ua, newIp, newUa },
    })
    await sendAnomalyAlertEmail(
      opts.email,
      `IP: ${opts.ip}\n设备: ${opts.ua}\n时间: ${new Date().toISOString()}\n新IP: ${newIp}\n新设备: ${newUa}`
    ).catch(() => {})
  }
}
