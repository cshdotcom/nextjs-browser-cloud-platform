'use client'

import * as React from 'react'
import { useAuth } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  ShieldCheck,
  Smartphone,
  KeyRound,
  ScrollText,
  Settings,
  LogOut,
  ShieldAlert,
  Sun,
  Moon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const NAV_ITEMS = [
  { id: 'dashboard', label: '总览', icon: LayoutDashboard },
  { id: 'account-security', label: '账号安全', icon: ShieldCheck },
  { id: 'twofactor', label: '双因素认证', icon: KeyRound },
  { id: 'sessions', label: '登录设备', icon: Smartphone },
  { id: 'api-tokens', label: 'API Token', icon: KeyRound },
  { id: 'security-logs', label: '安全日志', icon: ScrollText },
]

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const { user, view, setView, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const initials = React.useMemo(() => {
    const n = user?.name || user?.email || '?'
    return n.slice(0, 2).toUpperCase()
  }, [user])

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar sticky top-0 h-screen">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border/60">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 blur-md rounded-full" />
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-sm">Z.ai Secure</div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">安全控制台</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          个人
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}

        {isAdmin && (
          <>
            <div className="px-2 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              管理员
            </div>
            <button
              onClick={() => setView('admin')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                view === 'admin'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span className="truncate">管理后台</span>
              <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4">
                ADMIN
              </Badge>
            </button>
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-border/60 p-3 space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user?.name || user?.email}</div>
                <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {user?.role === 'superadmin' ? '超级管理员' : user?.role === 'admin' ? '管理员' : '普通用户'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              切换 {theme === 'dark' ? '浅色' : '深色'} 主题
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => logout()}>
          <LogOut className="h-3.5 w-3.5 mr-1.5" />
          退出登录
        </Button>
      </div>
    </aside>
  )
}

// Mobile nav (bottom bar) — shown on small screens
export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const { view, setView } = useAuth()
  const items = isAdmin
    ? [...NAV_ITEMS.slice(0, 4), { id: 'admin', label: '管理', icon: ShieldAlert }]
    : NAV_ITEMS.slice(0, 5)
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 border-t border-border/60 bg-card/95 backdrop-blur z-50 safe-area-inset-bottom">
      <div className="grid h-14" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
