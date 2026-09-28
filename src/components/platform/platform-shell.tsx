'use client'

import * as React from 'react'
import { useAuth } from '@/lib/auth-client'
import { usePlatformView, type ViewId } from '@/lib/platform-client'
import { AuthView } from '@/components/auth/auth-view'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Boxes,
  Server,
  Network,
  LayoutTemplate,
  Code2,
  FileText,
  Users,
  UsersRound,
  ScrollText,
  Settings,
  Clock,
  BellRing,
  Trash2,
  UserCircle,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Menu,
  Loader2,
} from 'lucide-react'
import { Dashboard } from './dashboard'
import { WorkspacesView } from './workspaces-view'
import { SingboxView } from './singbox-view'
import { ProxyView } from './proxy-view'
import { TemplatesView } from './templates-view'
import { ScriptsView } from './scripts-view'
import { FilesView } from './files-view'
import { UsersView } from './users-view'
import { GroupsView } from './groups-view'
import { AuditView } from './audit-view'
import { ConfigView } from './config-view'
import { ScheduleView } from './schedule-view'
import { AlertsView } from './alerts-view'
import { RecycleView } from './recycle-view'
import { AccountView } from './account-view'
import { NotificationBadge } from './notification-badge'
import { GlobalSearch } from './global-search'

interface NavItem {
  id: ViewId
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: '总览', icon: LayoutDashboard },
  { id: 'workspaces', label: '浏览器工作区', icon: Boxes },
  { id: 'singbox', label: 'Sing-Box 实例', icon: Server, adminOnly: true },
  { id: 'proxy', label: '代理节点', icon: Network, adminOnly: true },
  { id: 'templates', label: '模板管理', icon: LayoutTemplate },
  { id: 'scripts', label: '脚本市场', icon: Code2, adminOnly: true },
  { id: 'files', label: '文件管理', icon: FileText },
  { id: 'users', label: '用户管理', icon: Users, adminOnly: true },
  { id: 'groups', label: '用户组', icon: UsersRound, adminOnly: true },
  { id: 'audit', label: '审计日志', icon: ScrollText, adminOnly: true },
  { id: 'config', label: '系统设置', icon: Settings, adminOnly: true },
  { id: 'schedule', label: '定时任务', icon: Clock, adminOnly: true },
  { id: 'alerts', label: '告警中心', icon: BellRing },
  { id: 'recycle', label: '回收站', icon: Trash2 },
  { id: 'account', label: '个人中心', icon: UserCircle },
]

const VIEW_TITLE: Record<ViewId, string> = {
  dashboard: '总览',
  workspaces: '浏览器工作区',
  singbox: 'Sing-Box 实例',
  proxy: '代理节点',
  templates: '模板管理',
  scripts: '脚本市场',
  files: '文件管理',
  users: '用户管理',
  groups: '用户组',
  audit: '审计日志',
  config: '系统设置',
  schedule: '定时任务',
  alerts: '告警中心',
  recycle: '回收站',
  account: '个人中心',
}

function filterNav(role: string): NavItem[] {
  const isAdmin = role === 'admin' || role === 'superadmin'
  return NAV.filter((n) => !n.adminOnly || isAdmin)
}

function renderView(view: ViewId): React.ReactNode {
  switch (view) {
    case 'dashboard': return <Dashboard />
    case 'workspaces': return <WorkspacesView />
    case 'singbox': return <SingboxView />
    case 'proxy': return <ProxyView />
    case 'templates': return <TemplatesView />
    case 'scripts': return <ScriptsView />
    case 'files': return <FilesView />
    case 'users': return <UsersView />
    case 'groups': return <GroupsView />
    case 'audit': return <AuditView />
    case 'config': return <ConfigView />
    case 'schedule': return <ScheduleView />
    case 'alerts': return <AlertsView />
    case 'recycle': return <RecycleView />
    case 'account': return <AccountView />
    default: return null
  }
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border/60">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/30 blur-md rounded-full" />
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
      </div>
      <div className="leading-tight">
        <div className="font-semibold text-sm">Z.ai 浏览器云平台</div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">企业级浏览器工作区</div>
      </div>
    </div>
  )
}

function NavList({ items, view, setView, onNavigate }: {
  items: NavItem[]
  view: ViewId
  setView: (v: ViewId) => void
  onNavigate?: () => void
}) {
  return (
    <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon
        const active = view === item.id
        return (
          <button
            key={item.id}
            onClick={() => {
              setView(item.id)
              onNavigate?.()
            }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.adminOnly && (
              <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4">
                ADMIN
              </Badge>
            )}
          </button>
        )
      })}
    </nav>
  )
}

function UserBlock({ user, setView }: { user: { email: string; name: string | null; role: string } | null; setView: (v: ViewId) => void }) {
  const { theme, setTheme } = useTheme()
  const initials = (user?.name || user?.email || '?').slice(0, 2).toUpperCase()
  const roleLabel = user?.role === 'superadmin' ? '超级管理员' : user?.role === 'admin' ? '管理员' : '普通用户'
  return (
    <div className="border-t border-border/60 p-3">
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
          <DropdownMenuLabel className="text-xs text-muted-foreground">{roleLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setView('account')}>
            <UserCircle className="h-4 w-4 mr-2" />
            个人中心
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            切换 {theme === 'dark' ? '浅色' : '深色'} 主题
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => useAuth.getState().logout()}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function PlatformShell() {
  const { loading, authenticated, user } = useAuth()
  const { view, setView } = usePlatformView()
  const { theme, setTheme } = useTheme()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm">正在加载平台…</span>
        </div>
      </div>
    )
  }

  if (!authenticated || !user) {
    return <AuthView />
  }

  const nav = filterNav(user.role)
  const isAdmin = user.role === 'admin' || user.role === 'superadmin'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar (mobile + desktop) */}
      <header className="sticky top-0 z-40 h-14 flex items-center gap-2 px-3 md:px-6 border-b border-border/60 bg-background/80 backdrop-blur">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">导航</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-full">
              <Brand />
              <NavList items={nav} view={view} setView={setView} onNavigate={() => setMobileNavOpen(false)} />
              <UserBlock user={user} setView={setView} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight hidden md:block">{VIEW_TITLE[view]}</h1>
          {isAdmin && (
            <Badge variant="outline" className="text-[9px] gap-1 border-primary/30 text-primary">
              <ShieldCheck className="h-3 w-3" /> 管理员
            </Badge>
          )}
        </div>
        <div className="flex-1 max-w-md mx-auto px-2">
          <GlobalSearch />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <NotificationBadge />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar sticky top-14 h-[calc(100vh-3.5rem)]">
          <Brand />
          <NavList items={nav} view={view} setView={setView} />
          <UserBlock user={user} setView={setView} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-x-hidden pb-16 md:pb-0">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-5">{renderView(view)}</div>
        </main>
      </div>

      <footer className="hidden md:block border-t border-border/60 bg-card/30 px-6 py-3 text-center text-xs text-muted-foreground">
        Z.ai 浏览器云平台 · 内置 Sing-Box 编排 · Steel-Browser CDP/NoVNC 会话 · 全部操作写入审计日志
      </footer>
    </div>
  )
}
