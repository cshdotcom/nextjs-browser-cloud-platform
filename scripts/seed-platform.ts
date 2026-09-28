import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

async function main() {
  // Default system config
  const defaultConfigs = [
    { key: 'system.name', valueJson: JSON.stringify('Z.ai 远程浏览器工作平台'), category: 'ui', description: '系统名称' },
    { key: 'system.maintenanceMode', valueJson: JSON.stringify(false), category: 'system', description: '维护模式开关' },
    { key: 'system.maintenanceMessage', valueJson: JSON.stringify('系统维护中，请稍后再试'), category: 'system', description: '维护提示' },
    { key: 'session.maxLifetimeHours', valueJson: JSON.stringify(24), category: 'session', description: '会话最大存活' },
    { key: 'session.idleTimeoutMinutes', valueJson: JSON.stringify(60), category: 'session', description: '闲置登出' },
    { key: 'security.passwordMinLength', valueJson: JSON.stringify(8), category: 'security', description: '密码最小长度' },
    { key: 'security.passwordRequireUppercase', valueJson: JSON.stringify(true), category: 'security' },
    { key: 'security.passwordRequireLowercase', valueJson: JSON.stringify(true), category: 'security' },
    { key: 'security.passwordRequireDigit', valueJson: JSON.stringify(true), category: 'security' },
    { key: 'security.passwordRequireSpecial', valueJson: JSON.stringify(true), category: 'security' },
    { key: 'security.maxFailedLoginAttempts', valueJson: JSON.stringify(5), category: 'security' },
    { key: 'security.lockoutDurationMinutes', valueJson: JSON.stringify(15), category: 'security' },
    { key: 'rateLimit.anonymousQps', valueJson: JSON.stringify(10), category: 'rateLimit' },
    { key: 'rateLimit.authenticatedQps', valueJson: JSON.stringify(60), category: 'rateLimit' },
    { key: 'rateLimit.apiTokenQps', valueJson: JSON.stringify(100), category: 'rateLimit' },
    { key: 'quota.global.maxSessions', valueJson: JSON.stringify(100), category: 'quota' },
    { key: 'quota.global.maxNovncSessions', valueJson: JSON.stringify(20), category: 'quota' },
    { key: 'alert.silenceWindowStart', valueJson: JSON.stringify('22:00'), category: 'alert' },
    { key: 'alert.silenceWindowEnd', valueJson: JSON.stringify('08:00'), category: 'alert' },
    { key: 'storage.type', valueJson: JSON.stringify('local'), category: 'storage' },
    { key: 'storage.localPath', valueJson: JSON.stringify('./storage'), category: 'storage' },
    { key: 'backup.enabled', valueJson: JSON.stringify(false), category: 'backup' },
    { key: 'backup.retentionCount', valueJson: JSON.stringify(7), category: 'backup' },
    { key: 'token.maxPerUser', valueJson: JSON.stringify(20), category: 'token' },
    { key: 'token.allowPermanent', valueJson: JSON.stringify(true), category: 'token' },
    { key: 'token.maxExpiryDays', valueJson: JSON.stringify(365), category: 'token' },
    { key: 'token.expiryWarningDays', valueJson: JSON.stringify(7), category: 'token' },
    { key: 'workspace.defaultTtlMinutes', valueJson: JSON.stringify(120), category: 'workspace' },
    { key: 'workspace.defaultIdleTimeoutMinutes', valueJson: JSON.stringify(30), category: 'workspace' },
  ]
  for (const c of defaultConfigs) {
    await db.systemConfig.upsert({ where: { key: c.key }, update: {}, create: c })
  }

  // Global quota — per-resource rows (new schema: scope+scopeId+resource unique)
  const globalQuotas = [
    { resource: 'browser_workspace', hardLimit: 100, reserved: 10 },
    { resource: 'novnc_workspace', hardLimit: 20, reserved: 2 },
    { resource: 'singbox_cpu', hardLimit: 16, reserved: 2 },
    { resource: 'singbox_memory', hardLimit: 32768, reserved: 4096 },
    { resource: 'storage_bytes', hardLimit: 102400, reserved: 10240 },
  ]
  for (const q of globalQuotas) {
    await db.quota.upsert({
      where: { scope_scopeId_resource: { scope: 'global', scopeId: 'global', resource: q.resource } },
      update: {},
      create: { scope: 'global', scopeId: 'global', resource: q.resource, hardLimit: q.hardLimit, reserved: q.reserved },
    })
  }

  // Super admin
  const adminEmail = 'admin@zai.local'
  const existing = await db.user.findUnique({ where: { email: adminEmail } })
  if (!existing) {
    const hash = await bcrypt.hash('Admin@123456', 12)
    await db.user.create({
      data: {
        username: 'admin',
        email: adminEmail,
        displayName: '超级管理员',
        passwordHash: hash,
        role: 'superadmin',
        status: 'active',
        emailVerified: true,
      },
    })
    console.log('Seeded superadmin:', adminEmail)
  }

  // Demo user
  const userEmail = 'user@zai.local'
  const existingUser = await db.user.findUnique({ where: { email: userEmail } })
  if (!existingUser) {
    const hash = await bcrypt.hash('User@123456', 12)
    await db.user.create({
      data: {
        username: 'user',
        email: userEmail,
        displayName: '演示用户',
        passwordHash: hash,
        role: 'user',
        status: 'active',
        emailVerified: true,
      },
    })
    console.log('Seeded demo user:', userEmail)
  }

  console.log('Seed complete.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
