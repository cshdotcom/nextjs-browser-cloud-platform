import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { getContainerLogs } from '@/lib/docker-client'
import { requireSuperadmin } from '@/lib/platform-auth'

// GET /api/platform/singbox-instances/[id]/logs — container logs
//   Query: ?tail=200&since=3600 (seconds) &until=0&timestamps=true
export const GET = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSuperadmin()
  const { id } = await ctx.params
  const inst = await db.singboxInstance.findUnique({ where: { id } })
  if (!inst || inst.deletedAt) {
    throw new ValidationError('实例不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (!inst.dockerContainerId) {
    throw new ValidationError('实例未绑定 Docker 容器', { code: 'VALIDATION_FAILED', httpStatus: 400 })
  }
  const url = new URL(req.url)
  const tailParam = url.searchParams.get('tail') || '200'
  const tail = tailParam === 'all' ? 'all' : Math.min(Math.max(parseInt(tailParam, 10) || 200, 1), 5000)
  const since = url.searchParams.get('since') ? Number(url.searchParams.get('since')) : undefined
  const until = url.searchParams.get('until') ? Number(url.searchParams.get('until')) : undefined
  const timestamps = url.searchParams.get('timestamps') !== 'false'

  const { stdout, stderr, combined } = await getContainerLogs(inst.dockerContainerId, tail as number | 'all', {
    sinceSeconds: since,
    untilSeconds: until,
    timestamps,
  })

  return { stdout, stderr, combined }
})
