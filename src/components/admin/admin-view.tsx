'use client'

import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { ShieldAlert } from 'lucide-react'
import { AdminDashboard } from './admin-dashboard'
import { AdminAnalytics } from './admin-analytics'
import { AdminUsersTable } from './admin-users-table'
import { AdminSecuritySettings } from './admin-security-settings'
import { AdminAuditLogs } from './admin-audit-logs'
import { AdminSessions } from './admin-sessions'
import { AdminUserGroups } from './admin-user-groups'
import { AdminDevMail } from './admin-dev-mail'

export function AdminView() {
  return (
    <div>
      <PageHeader
        title="管理员控制台"
        description="全局安全配置、用户管理、2FA 管控、会话管理与审计日志"
        icon={<ShieldAlert className="h-5 w-5" />}
      />
      <Tabs defaultValue="dashboard" className="w-full">
        <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
          <TabsList className="flex w-max min-w-full h-auto gap-1 mb-4">
            <TabsTrigger value="dashboard">概览</TabsTrigger>
            <TabsTrigger value="analytics">风控分析</TabsTrigger>
            <TabsTrigger value="users">用户管理</TabsTrigger>
            <TabsTrigger value="security">安全配置</TabsTrigger>
            <TabsTrigger value="sessions">在线会话</TabsTrigger>
            <TabsTrigger value="audit">审计日志</TabsTrigger>
            <TabsTrigger value="groups">用户组</TabsTrigger>
            <TabsTrigger value="dev-mail">邮件箱</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="dashboard"><AdminDashboard /></TabsContent>
        <TabsContent value="analytics"><AdminAnalytics /></TabsContent>
        <TabsContent value="users"><AdminUsersTable /></TabsContent>
        <TabsContent value="security"><AdminSecuritySettings /></TabsContent>
        <TabsContent value="sessions"><AdminSessions /></TabsContent>
        <TabsContent value="audit"><AdminAuditLogs /></TabsContent>
        <TabsContent value="groups"><AdminUserGroups /></TabsContent>
        <TabsContent value="dev-mail"><AdminDevMail /></TabsContent>
      </Tabs>
    </div>
  )
}
