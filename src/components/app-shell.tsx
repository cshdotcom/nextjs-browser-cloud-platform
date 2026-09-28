'use client'

import * as React from 'react'
import { useAuth } from '@/lib/auth-client'
import { AuthView } from '@/components/auth/auth-view'
import { Sidebar, MobileNav } from './sidebar'
import { DashboardView } from '@/components/account/dashboard-view'
import { AccountSecurityView } from '@/components/account/account-security-view'
import { TwoFactorView } from '@/components/account/twofactor-view'
import { SessionsView } from '@/components/account/sessions-view'
import { ApiTokensView } from '@/components/account/api-tokens-view'
import { SecurityLogsView } from '@/components/account/security-logs-view'
import { AdminView } from '@/components/admin/admin-view'
import { Loader2, ShieldCheck } from 'lucide-react'

export function AppShell() {
  const { loading, authenticated, user, view } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm">正在加载安全会话…</span>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <AuthView />
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1">
        <Sidebar isAdmin={isAdmin} />
        <main className="flex-1 min-w-0 overflow-x-hidden pb-16 md:pb-0">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
            {view === 'dashboard' && <DashboardView />}
            {view === 'account-security' && <AccountSecurityView />}
            {view === 'twofactor' && <TwoFactorView />}
            {view === 'sessions' && <SessionsView />}
            {view === 'api-tokens' && <ApiTokensView />}
            {view === 'security-logs' && <SecurityLogsView />}
            {view === 'admin' && isAdmin && <AdminView />}
            {view === 'admin' && !isAdmin && (
              <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
                <div className="text-center">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>您没有管理员权限</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <footer className="hidden md:block border-t border-border/60 bg-card/30 px-6 py-3 text-center text-xs text-muted-foreground">
        Z.ai Secure · 企业级身份认证与账号安全平台 · 所有操作均写入安全审计日志
      </footer>
      <MobileNav isAdmin={isAdmin} />
    </div>
  )
}
