import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'

// In-process locks keyed by task id. Prevents concurrent runs of the same task.
const runningTasks = new Map<string, number>() // taskId -> startedAt ms

// POST /api/platform/schedule-tasks/[id]/run — manual trigger
export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const task = await db.scheduleTask.findUnique({ where: { id } })
  if (!task) {
    throw new ValidationError('任务不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }

  // In-memory lock check
  if (runningTasks.has(id)) {
    throw new BizError('任务正在执行中，请稍后再试', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { taskId: id, startedAt: runningTasks.get(id) },
    })
  }
  runningTasks.set(id, Date.now())

  const startedAt = new Date()
  let result = 'ok'
  let errorStack: string | null = null
  try {
    // Best-effort manual execution: invoke the platform cron logic for this task.
    // The real cron runner is in /api/platform/cron/route.ts — here we just
    // call the same dispatcher, scoped to the named task.
    const { runTaskByName } = await import('@/lib/cron-runner')
    await runTaskByName(task.name)
    await db.scheduleTask.update({
      where: { id },
      data: {
        lastExecuteAt: startedAt,
        lastResult: 'manual:ok',
        consecutiveFailures: 0,
        lastError: null,
      },
    })
  } catch (e) {
    result = 'error'
    errorStack = e instanceof Error ? e.stack || e.message : String(e)
    await db.scheduleTask.update({
      where: { id },
      data: {
        lastExecuteAt: startedAt,
        lastResult: 'manual:error',
        lastError: errorStack,
        consecutiveFailures: { increment: 1 },
      },
    })
  } finally {
    runningTasks.delete(id)
  }

  await db.scheduleTaskLog.create({
    data: { taskId: id, startedAt, finishedAt: new Date(), result, errorStack },
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'run',
    resourceType: 'schedule-task',
    resourceId: id,
    req,
    afterJson: { taskName: task.name, result },
  })

  if (result === 'error') {
    throw new BizError('任务执行失败', { code: 'INTERNAL_ERROR', httpStatus: 500, data: { errorStack } })
  }

  return { id, taskName: task.name, result, startedAt }
})
