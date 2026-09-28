'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { ShieldCheck } from 'lucide-react'
import { ChangePasswordForm } from './change-password-form'
import { ChangeEmailForm } from './change-email-form'
import { useAuth } from '@/lib/auth-client'

export function AccountSecurityView() {
  const { user, fetchMe } = useAuth()
  return (
    <div>
      <PageHeader
        title="账号安全"
        description="修改密码、更换绑定邮箱。所有操作均校验身份并记录审计日志。"
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <Tabs defaultValue="password" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
          <TabsTrigger value="password">修改密码</TabsTrigger>
          <TabsTrigger value="email">更换邮箱</TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="text-base">修改密码</CardTitle>
              <CardDescription>
                需校验旧密码{user?.twoFactorEnabled ? '与 2FA 验证码' : ''}。修改成功后除当前设备外全部会话将被踢出。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="email">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="text-base">更换绑定邮箱</CardTitle>
              <CardDescription>
                需同时校验<b className="text-foreground">旧邮箱</b>与<b className="text-foreground">新邮箱</b>的两个验证码，双重确认后才允许更换。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangeEmailForm onChanged={fetchMe} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
