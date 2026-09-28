'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { BellRing, CheckCheck, Loader2 } from 'lucide-react'
import { pfFetch, usePlatformFetch, formatRel, type Notice } from '@/lib/platform-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface NoticeResp {
  items: Notice[]
  total: number
  unreadCount?: number
}

export function NotificationBadge() {
  const [open, setOpen] = React.useState(false)
  const [markingAll, setMarkingAll] = React.useState(false)

  const { data, loading, reload } = usePlatformFetch<NoticeResp>('/api/platform/notices?pageSize=20')

  const unreadCount = data?.unreadCount ?? data?.items.filter((n) => !n.read).length ?? 0

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await pfFetch('/api/platform/notices/read-all', { method: 'POST' })
      toast.success('全部已读')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 relative"
          aria-label="通知"
        >
          <BellRing className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">通知</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[9px] bg-red-500/10 text-red-500">{unreadCount} 未读</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={markAllRead} disabled={markingAll}>
              {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
              全部已读
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.items || data.items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <BellRing className="h-8 w-8 mx-auto mb-2 opacity-40" />
              暂无通知
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {data.items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'px-3 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer',
                    !n.read && 'bg-primary/5',
                  )}
                  onClick={() => {
                    if (!n.read) {
                      pfFetch(`/api/platform/notices/${n.id}/read`, { method: 'POST' }).then(reload).catch(() => {})
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      {n.content && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.content}</div>}
                      <div className="text-[10px] text-muted-foreground/70 mt-1">{formatRel(n.createdAt)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
