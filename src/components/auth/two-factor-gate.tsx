'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ShieldCheck, Loader2, KeyRound, Fingerprint, AlertTriangle } from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'

export function TwoFactorGate({ email, forceTwoFactor }: { email: string; forceTwoFactor: boolean }) {
  const [type, setType] = React.useState<'totp' | 'backup'>('totp')
  const [code, setCode] = React.useState('')
  const [trustDevice, setTrustDevice] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const { fetchMe, setPending2fa } = useAuth()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code) return toast.error('请输入验证码')
    setLoading(true)
    try {
      await jsonFetch('/api/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ code, type, trustDevice }),
      })
      toast.success('双因素验证通过')
      setPending2fa(null)
      await fetchMe()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '验证失败')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  function cancel() {
    setPending2fa(null)
    toast.info('已取消登录')
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 auth-gradient" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="relative z-10 w-full max-w-md">
        <Card className="border-border/60 shadow-xl backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-3 pb-2">
            <div className="mx-auto relative">
              <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg mx-auto">
                <ShieldCheck className="h-7 w-7" />
              </div>
            </div>
            <CardTitle className="text-xl">双因素验证</CardTitle>
            <CardDescription>
              正在登录 <span className="text-primary font-medium">{email}</span>
              <br />
              请完成二次身份验证以继续
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {forceTwoFactor && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>系统已开启强制双因素策略，您必须完成 2FA 验证后才能进入系统。</span>
              </div>
            )}

            <Tabs value={type} onValueChange={(v) => { setType(v as 'totp' | 'backup'); setCode('') }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="totp" className="gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  动态验证码
                </TabsTrigger>
                <TabsTrigger value="backup" className="gap-1.5">
                  备份码
                </TabsTrigger>
              </TabsList>
              <TabsContent value="totp" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  请打开您的验证器 App（Google Authenticator / Authy / 1Password 等），输入显示的 6 位动态验证码。
                </p>
                <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </TabsContent>
              <TabsContent value="backup" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  输入您在开启 2FA 时保存的一次性备份恢复码（使用后立即作废）。
                </p>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono uppercase tracking-wider text-center"
                  placeholder="XXXXX-XXXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={loading}
                />
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
              <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 flex items-center gap-2">
                <Checkbox id="trust" checked={trustDevice} onCheckedChange={(v) => setTrustDevice(!!v)} />
                <Label htmlFor="trust" className="text-xs font-normal cursor-pointer">
                  信任此设备（{30} 天内免二次验证）
                </Label>
              </div>
            </div>

            <Button onClick={submit} className="w-full" disabled={loading || !code}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              验证并登录
            </Button>
            <Button variant="ghost" className="w-full" onClick={cancel} disabled={loading}>
              取消登录
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
