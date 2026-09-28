'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PasswordLoginForm } from './password-login-form'
import { EmailCodeLoginForm } from './email-code-login-form'
import { RegisterForm } from './register-form'
import { ForgotPasswordForm } from './forgot-password-form'
import { ActivateForm } from './activate-form'
import { ShieldCheck, Lock, Mail, KeyRound } from 'lucide-react'
import { useAuth } from '@/lib/auth-client'
import { TwoFactorGate } from './two-factor-gate'
import { ForcedPasswordChangeView } from './forced-password-change-view'

type AuthTab = 'login' | 'email-code' | 'register' | 'forgot' | 'activate'

export function AuthView() {
  const [tab, setTab] = React.useState<AuthTab>('login')
  const { pending2fa, pendingPasswordChange } = useAuth()
  const [captchaEnabled, setCaptchaEnabled] = React.useState(true)
  const [allowRegistration, setAllowRegistration] = React.useState(true)

  // Fetch public security config once on mount
  React.useEffect(() => {
    fetch('/api/public/security-config').then((r) => r.json()).then((d) => {
      if (d.ok) {
        setCaptchaEnabled(d.config.enableLoginCaptcha)
        setAllowRegistration(d.config.allowRegistration)
      }
    }).catch(() => {})
  }, [])

  if (pendingPasswordChange) {
    return <ForcedPasswordChangeView email={pendingPasswordChange.email} reason={pendingPasswordChange.reason} />
  }

  if (pending2fa) {
    return <TwoFactorGate forceTwoFactor={pending2fa.forceTwoFactor} email={pending2fa.email} />
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="pointer-events-none absolute inset-0 auth-gradient" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      <header className="relative z-10 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="font-semibold tracking-tight">Z.ai Secure</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">身份认证安全平台</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          端到端加密 · 零信任架构
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          <Tabs value={tab} onValueChange={(v) => setTab(v as AuthTab)} className="w-full">
            <TabsList className={`grid w-full ${allowRegistration ? 'grid-cols-3' : 'grid-cols-2'} mb-5`}>
              <TabsTrigger value="login" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                密码登录
              </TabsTrigger>
              <TabsTrigger value="email-code" className="gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                验证码
              </TabsTrigger>
              {allowRegistration && (
                <TabsTrigger value="register" className="gap-1.5">
                  注册
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="login">
              <AuthCard title="账号登录" description="使用邮箱与密码登录您的账号">
                <PasswordLoginForm onForgot={() => setTab('forgot')} captchaEnabled={captchaEnabled} />
              </AuthCard>
            </TabsContent>

            <TabsContent value="email-code">
              <AuthCard title="邮箱验证码登录" description="免密登录，验证码将发送至您的邮箱">
                <EmailCodeLoginForm captchaEnabled={captchaEnabled} />
              </AuthCard>
            </TabsContent>

            {allowRegistration && (
              <TabsContent value="register">
                <AuthCard title="注册新账号" description="创建您的安全账号，开启双因素保护">
                  <RegisterForm onActivate={() => setTab('activate')} />
                </AuthCard>
              </TabsContent>
            )}

            {tab === 'forgot' && (
              <AuthCard title="找回密码" description="通过邮箱验证码重置您的密码">
                <ForgotPasswordForm onBack={() => setTab('login')} captchaEnabled={captchaEnabled} />
              </AuthCard>
            )}

            {tab === 'activate' && (
              <AuthCard title="激活账号" description="请输入您邮箱收到的激活验证码">
                <ActivateForm onBack={() => setTab('login')} />
              </AuthCard>
            )}
          </Tabs>

          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            <FeatureBadge icon={<KeyRound className="h-3.5 w-3.5" />} label="密码策略" />
            <FeatureBadge icon={<ShieldCheck className="h-3.5 w-3.5" />} label="TOTP 2FA" />
            <FeatureBadge icon={<Lock className="h-3.5 w-3.5" />} label="会话隔离" />
          </div>

          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-center text-[11px] text-muted-foreground">
            <span className="text-primary font-medium">演示账号</span>：admin@zai.local / Admin@123456　|　user@zai.local / User@123456
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 py-4 text-center text-xs text-muted-foreground">
        © Z.ai Secure · 企业级身份认证 · 所有操作均记录审计日志
      </footer>
    </div>
  )
}

function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-border/60 shadow-xl backdrop-blur-sm bg-card/95">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function FeatureBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm py-2.5">
      <span className="text-primary">{icon}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}
