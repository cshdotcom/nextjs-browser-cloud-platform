'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  trend?: string
  accent?: 'primary' | 'amber' | 'emerald' | 'red' | 'sky'
  loading?: boolean
}

const ACCENT: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
}

export function StatCard({ label, value, icon, trend, accent = 'primary', loading }: StatCardProps) {
  return (
    <div className="group relative rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      {/* subtle gradient glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="flex items-center justify-between mb-3 relative">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition-transform group-hover:scale-110', ACCENT[accent])}>
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold tabular-nums relative">
        {loading ? <span className="inline-block w-12 h-6 rounded bg-muted/50 animate-pulse align-middle" /> : value}
      </div>
      {trend && <div className="text-[11px] text-muted-foreground mt-1 relative">{trend}</div>}
    </div>
  )
}
