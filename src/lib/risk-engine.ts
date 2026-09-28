import { db } from '@/lib/db'
import { lookupGeo } from '@/lib/geoip'
import { killAllSessions } from '@/lib/session'
import { audit } from '@/lib/audit'
import { getSecuritySettings } from '@/lib/security-settings'

// Risk rule engine: evaluates configured rules against security events
// and automatically executes the configured action.

export interface RuleConditions {
  eventType?: string // e.g. 'login_failed' — if set, count this event type
  threshold?: number // how many events in the window to trigger
  windowMinutes?: number // rolling window in minutes
  newGeo?: boolean // trigger if a login comes from a new country (not seen before)
  newDevice?: boolean // trigger if a login comes from a new UA (not seen before)
  severity?: string // trigger on events of this severity
}

export type RuleAction =
  | 'lock_account'
  | 'force_logout'
  | 'disable_account'
  | 'alert_only'
  | 'force_password_change'

// Seed default rules if none exist
export async function ensureDefaultRules(): Promise<void> {
  const count = await db.riskRule.count()
  if (count > 0) return
  await db.riskRule.createMany({
    data: [
      {
        name: '连续登录失败自动锁定',
        description: '同一用户在 10 分钟内连续 5 次登录失败，自动锁定账号',
        conditions: JSON.stringify({ eventType: 'login_failed', threshold: 5, windowMinutes: 10 }),
        action: 'lock_account',
      },
      {
        name: '异地登录告警',
        description: '检测到来自新国家/地区的登录尝试时发出告警',
        conditions: JSON.stringify({ newGeo: true }),
        action: 'alert_only',
      },
      {
        name: '陌生设备登录告警',
        description: '检测到来自新浏览器/设备的登录时发出告警',
        conditions: JSON.stringify({ newDevice: true }),
        action: 'alert_only',
      },
      {
        name: '严重安全事件自动强制下线',
        description: '检测到严重级别安全事件时自动强制用户全部设备下线',
        conditions: JSON.stringify({ severity: 'critical' }),
        action: 'force_logout',
      },
    ],
  })
  console.log('[risk-engine] Seeded 4 default risk rules')
}

// Evaluate rules against a new security event. Called after each audit log write.
// The `event` param describes what just happened.
export async function evaluateRules(opts: {
  userId: string | null
  eventType: string
  severity: string
  ipAddress: string | null
  userAgent: string | null
  req?: Request
}): Promise<void> {
  const { userId, eventType, severity, ipAddress, userAgent } = opts
  if (!userId) return

  const rules = await db.riskRule.findMany({ where: { enabled: true } })
  for (const rule of rules) {
    const cond = JSON.parse(rule.conditions) as RuleConditions
    let triggered = false
    let detail = ''

    // Condition: severity match
    if (cond.severity && severity === cond.severity) {
      triggered = true
      detail = `严重事件触发：${eventType}`
    }

    // Condition: event type count in window
    if (cond.eventType && cond.threshold && cond.windowMinutes) {
      const since = new Date(Date.now() - cond.windowMinutes * 60 * 1000)
      const count = await db.securityAuditLog.count({
        where: { userId, eventType: cond.eventType, createdAt: { gt: since } },
      })
      if (count >= cond.threshold) {
        triggered = true
        detail = `${cond.eventType} 在 ${cond.windowMinutes} 分钟内达到 ${count} 次（阈值 ${cond.threshold}）`
      }
    }

    // Condition: new geo (login from a country not seen before for this user)
    if (cond.newGeo && eventType === 'login_success' && ipAddress) {
      const geo = lookupGeo(ipAddress)
      const countryKey = geo.country || geo.countryName || (geo.isPrivate ? '内网' : '未知')
      const priorFromSameGeo = await db.securityAuditLog.findFirst({
        where: {
          userId,
          eventType: 'login_success',
          createdAt: { lt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      })
      // Check if any prior login came from the same country (rough heuristic via IP)
      // For simplicity: if this is the user's first-ever login_success, it's "new"
      // For a real impl we'd compare geo of all prior logins
      if (!priorFromSameGeo) {
        // first login ever — not really "new geo" in the suspicious sense
      } else if (geo.isPrivate) {
        // internal — skip
      } else {
        // Check prior logins from same country
        const priorLogins = await db.securityAuditLog.findMany({
          where: { userId, eventType: 'login_success' },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
        const seenCountries = new Set<string>()
        for (const pl of priorLogins) {
          if (pl.id === opts.eventType) continue
          const plGeo = lookupGeo(pl.ipAddress)
          seenCountries.add(plGeo.country || plGeo.countryName || (plGeo.isPrivate ? '内网' : '未知'))
        }
        if (!seenCountries.has(countryKey)) {
          triggered = true
          detail = `检测到来自新地区 ${geo.countryName || countryKey} 的登录（IP: ${ipAddress}）`
        }
      }
    }

    // Condition: new device (login from a UA not seen before)
    if (cond.newDevice && eventType === 'login_success' && userAgent) {
      const priorLogins = await db.securityAuditLog.findMany({
        where: { userId, eventType: 'login_success' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      const seenUAs = new Set(priorLogins.map((p) => p.userAgent).filter(Boolean) as string[])
      if (!seenUAs.has(userAgent)) {
        triggered = true
        detail = `检测到来自新设备/浏览器的登录（UA: ${userAgent.slice(0, 60)}…）`
      }
    }

    if (!triggered) continue

    // Execute action
    await executeAction(rule.action, userId, rule.name, detail, ipAddress, opts.req)
    // Increment fire count
    await db.riskRule.update({
      where: { id: rule.id },
      data: { fireCount: { increment: 1 }, lastFiredAt: new Date() },
    })
  }
}

async function executeAction(
  action: string,
  userId: string,
  ruleName: string,
  detail: string,
  ipAddress: string | null,
  req?: Request
): Promise<void> {
  const settings = await getSecuritySettings()
  const lockMinutes = settings.lockoutDurationMinutes
  let actionTaken = action

  if (action === 'lock_account') {
    await db.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + lockMinutes * 60 * 1000),
      },
    })
    await killAllSessions(userId)
  } else if (action === 'force_logout') {
    await killAllSessions(userId)
  } else if (action === 'disable_account') {
    await db.user.update({ where: { id: userId }, data: { status: 'disabled' } })
    await killAllSessions(userId)
  } else if (action === 'force_password_change') {
    await db.passwordCredential.updateMany({
      where: { userId },
      data: { mustChange: true },
    })
  } else if (action === 'alert_only') {
    actionTaken = 'alert_only'
  }

  // Record the risk event
  await db.riskEvent.create({
    data: {
      userId,
      ruleName,
      action: actionTaken,
      detail,
      ipAddress,
    },
  })

  // Audit log
  await audit({
    userId,
    eventType: 'risk_rule_triggered',
    severity: action === 'alert_only' ? 'warning' : 'critical',
    req,
    metadata: { ruleName, action: actionTaken, detail, engine: 'risk_rule' },
  })
}
