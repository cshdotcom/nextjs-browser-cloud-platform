import { wrapHandler, BizError, ValidationError } from '@/lib/errors'
import { runAllEnabled, runTaskByName } from '@/lib/cron-runner'
import { requireCronSecret } from '@/lib/platform-auth'
import { z } from 'zod'

// POST /api/platform/cron — protected by internal CRON_SECRET header
//   Body (optional): { task?: string } — run a single named task. If absent,
//   runs ALL enabled tasks.
export const POST = wrapHandler(async (req: Request) => {
  await requireCronSecret(req)
  let taskName: string | undefined
  try {
    const raw = await req.text()
    if (raw) {
      const body = JSON.parse(raw) as unknown
      const parsed = z.object({ task: z.string().optional() }).safeParse(body)
      if (parsed.success) taskName = parsed.data.task
    }
  } catch {
    // Empty body or invalid JSON — fall through to "run all"
  }
  if (taskName) {
    try {
      const result = await runTaskByName(taskName)
      return { mode: 'single', task: taskName, result }
    } catch (e) {
      throw new BizError(`任务 ${taskName} 执行失败`, {
        code: 'INTERNAL_ERROR',
        httpStatus: 500,
        data: { error: e instanceof Error ? e.message : String(e) },
      })
    }
  }
  const summary = await runAllEnabled()
  if (Object.keys(summary.failed).length > 0 && summary.ran.length === 0) {
    throw new ValidationError('所有定时任务执行失败', { code: 'INTERNAL_ERROR', httpStatus: 500, data: summary })
  }
  return { mode: 'all', ...summary }
})
