import { db } from '../src/lib/db'
async function main() {
  await db.user.updateMany({ where: { email: { in: ['admin@zai.local', 'user@zai.local'] } }, data: { emailVerified: true, status: 'active' } })
  console.log('Fixed seed users emailVerified=true')
}
main().then(() => db.$disconnect())
