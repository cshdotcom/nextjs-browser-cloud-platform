'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  info: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  muted: 'bg-muted text-muted-foreground border-border',
  neutral: 'bg-primary/10 text-primary border-primary/30',
}

const STATUS_MAP: Record<string, Tone> = {
  running: 'success',
  active: 'success',
  creating: 'info',
  restarting: 'info',
  idle: 'muted',
  stopped: 'muted',
  draining: 'warning',
  error: 'danger',
  expired: 'danger',
  offline: 'danger',
  info: 'info',
  warning: 'warning',
  critical: 'danger',
  pending: 'warning',
  handled: 'success',
  ignored: 'muted',
  enabled: 'success',
  disabled: 'muted',
  read: 'muted',
  unread: 'info',
}

const LABEL_MAP: Record<string, string> = {
  running: '运行中',
  active: '活跃',
  creating: '创建中',
  restarting: '重启中',
  idle: '闲置',
  stopped: '已停止',
  draining: '排空中',
  error: '异常',
  expired: '已过期',
  offline: '离线',
  pending: '待处理',
  handled: '已处理',
  ignored: '已忽略',
  info: '提示',
  warning: '警告',
  critical: '严重',
  enabled: '启用',
  disabled: '禁用',
  read: '已读',
  unread: '未读',
  cdp_light: 'CDP轻量',
  novnc_full: 'NoVNC重度',
  external: '外部',
  internal_singbox: '内置Sing-Box',
  private: '私有',
  group: '组共享',
  global: '全局',
}

export function StatusBadge({
  status,
  label,
  dot,
  className,
}: {
  status: string
  label?: string
  dot?: boolean
  className?: string
}) {
  const tone = STATUS_MAP[status] || 'neutral'
  const text = label || LABEL_MAP[status] || status
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium gap-1 px-1.5 py-0 h-5', TONE_CLASS[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', `bg-current`)} />}
      {text}
    </Badge>
  )
}
