import { db } from '../src/lib/db'
async function main() {
  // Clear mustChange flag on all users
  await db.passwordCredential.updateMany({ where: {}, data: { mustChange: false } })
  console.log('Cleared mustChange flags')
}
main().then(() => db.$disconnect())
