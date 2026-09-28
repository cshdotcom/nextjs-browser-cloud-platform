'use client'

import * as React from 'react'
import { Loader2, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Graceful empty state — used when API returns no rows or fails entirely.
export function EmptyState({
  icon,
  title = '暂无数据',
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: { label: string; onClick: () => void }
  className?: string
}) {
  return (
    <div className={cn('text-center py-12 text-sm text-muted-foreground', className)}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <div className="font-medium text-foreground">{title}</div>
      {description && <p className="text-[11px] mt-1 max-w-md mx-auto">{description}</p>}
      {action && (
        <Button size="sm" variant="outline" className="mt-3" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function LoadingState({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-10">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-lg font-bold">
        !
      </div>
      <div className="text-sm text-foreground">数据加载失败</div>
      <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto break-all">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}
