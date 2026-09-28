import { db } from '../src/lib/db'
async function main() {
  const admin = await db.user.findUnique({ where: { email: 'admin@zai.local' } })
  if (!admin) { console.log('No admin user'); return }
  // Check if notices already exist
  const existing = await db.notice.count({ where: { userId: admin.id } })
  if (existing > 0) { console.log('Notices already exist:', existing); return }
  await db.notice.createMany({
    data: [
      { userId: admin.id, title: '系统已就绪', content: '浏览器云平台已完成初始化，所有核心服务运行正常', read: false },
      { userId: admin.id, title: '定时任务已注册', content: '6 个内置定时任务（会话回收/代理探测/Sing-Box同步等）已自动注册', read: false },
      { userId: admin.id, title: '安全提示', content: '检测到管理员账号未开启 2FA，建议尽快配置双因素认证', read: false },
      { userId: admin.id, title: '欢迎使用', content: 'Z.ai 浏览器云平台 — 企业级远程浏览器工作区 + Sing-Box 编排', read: true },
    ],
  })
  console.log('Created 4 demo notices (3 unread)')
}
main().then(() => db.$disconnect())
