import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/crypto'

async function main() {
  // Default security settings
  await db.securitySettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      allowRegistration: true,
      requireEmailActivation: false, // dev convenience — set true in prod
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireDigit: true,
      passwordRequireSpecial: true,
      passwordBlockWeakDictionary: true,
      maxFailedLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      emailCodeTtlMinutes: 5,
      emailCodeSendIntervalSeconds: 60,
      emailCodeMaxPerHour: 10,
      sessionMaxLifetimeHours: 24,
      sessionIdleTimeoutMinutes: 60,
      rememberSessionDays: 30,
      globalEnforceTwoFactor: false,
      allowEmailCodeLogin: true,
      trustedDeviceDays: 30,
      autoRevokeTokensOnSecurityChange: false,
      enableAnomalyAlert: true,
    },
  })

  // Default admin: admin@zai.local / Admin@123456
  const adminEmail = 'admin@zai.local'
  const existing = await db.user.findUnique({ where: { email: adminEmail } })
  if (!existing) {
    const hash = await hashPassword('Admin@123456')
    await db.user.create({
      data: {
        email: adminEmail,
        name: 'Super Admin',
        role: 'superadmin',
        status: 'active',
        emailVerified: true,
        password: { create: { hash } },
      },
    })
    console.log('Seeded admin user:', adminEmail, '/ Admin@123456')
  } else {
    console.log('Admin user already exists:', adminEmail)
  }

  // Demo regular user: user@zai.local / User@123456
  const userEmail = 'user@zai.local'
  const existingUser = await db.user.findUnique({ where: { email: userEmail } })
  if (!existingUser) {
    const hash = await hashPassword('User@123456')
    await db.user.create({
      data: {
        email: userEmail,
        name: 'Demo User',
        role: 'user',
        status: 'active',
        emailVerified: true,
        password: { create: { hash } },
      },
    })
    console.log('Seeded demo user:', userEmail, '/ User@123456')
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
