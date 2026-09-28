import { db } from '../src/lib/db'
async function main() {
  const existing = await db.userGroup.findFirst({ where: { name: '核心开发组' } })
  if (existing) { console.log('Group already exists'); return }
  const group = await db.userGroup.create({
    data: { name: '核心开发组', description: '核心开发团队成员组', enabled: true },
  })
  // Add admin user as member
  const admin = await db.user.findUnique({ where: { email: 'admin@zai.local' } })
  if (admin) {
    await db.groupUser.create({ data: { groupId: group.id, userId: admin.id, role: 'admin' } })
  }
  console.log('Created group:', group.id)
}
main().then(() => db.$disconnect())
