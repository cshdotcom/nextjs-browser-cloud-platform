'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  accent = 'primary',
}: {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  trend?: string
  accent?: 'primary' | 'amber' | 'emerald' | 'red'
}) {
  const accentMap = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', accentMap[accent])}>
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {trend && <div className="text-[11px] text-muted-foreground mt-1">{trend}</div>}
    </div>
  )
}
