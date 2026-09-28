import { db } from '../src/lib/db'

async function main() {
  await db.securitySettings.update({
    where: { id: 'singleton' },
    data: { passwordExpiryDays: 90, passwordExpiryWarningDays: 30, passwordHistoryCount: 3 },
  })
  const user = await db.user.findUnique({ where: { email: 'user@zai.local' }, include: { password: true } })
  if (user?.password) {
    const oldDate = new Date(Date.now() - 100 * 86400 * 1000)
    await db.passwordCredential.update({ where: { userId: user.id }, data: { changedAt: oldDate } })
    console.log('Set user password changedAt to 100 days ago')
  }
  console.log('Settings updated')
}
main().then(() => db.$disconnect())
