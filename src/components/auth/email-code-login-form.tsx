'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Mail, Loader2, Send, Timer } from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'
import { CaptchaWidget } from './captcha-widget'

export function EmailCodeLoginForm({ captchaEnabled }: { captchaEnabled: boolean }) {
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [captchaToken, setCaptchaToken] = React.useState('')
  const [captchaAnswer, setCaptchaAnswer] = React.useState('')
  const [remember, setRemember] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)

  const { setPending2fa, fetchMe } = useAuth()

  React.useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function sendCode() {
    if (!email) {
      toast.error('请输入邮箱')
      return
    }
    if (captchaEnabled && captchaAnswer.length !== 5) {
      toast.error('请先输入图形验证码')
      return
    }
    setSending(true)
    try {
      await jsonFetch('/api/auth/login-code', {
        method: 'POST',
        body: JSON.stringify({ email, purpose: 'login', captchaToken, captchaAnswer }),
      })
      setSent(true)
      setCountdown(60)
      toast.success('验证码已发送，请查收邮箱')
      setCaptchaAnswer('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '发送失败')
      setCaptchaAnswer('')
    } finally {
      setSending(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || code.length !== 6) {
      toast.error('请输入邮箱与 6 位验证码')
      return
    }
    setLoading(true)
    try {
      const data = await jsonFetch('/api/auth/login-code/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code, remember }),
      })
      if (data.stage === 'twofa_required') {
        setPending2fa({ email: data.email, forceTwoFactor: data.forceTwoFactor })
        toast.info('请完成双因素验证')
      } else if (data.stage === 'success') {
        toast.success('登录成功')
        await fetchMe()
      }
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number }
      toast.error(e.message || '验证码错误或已过期')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ec-email">邮箱</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="ec-email"
            type="email"
            placeholder="you@example.com"
            className="pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || sending}
          />
        </div>
      </div>

      {captchaEnabled && (
        <CaptchaWidget
          token={captchaToken}
          answer={captchaAnswer}
          onTokenChange={setCaptchaToken}
          onAnswerChange={setCaptchaAnswer}
          disabled={loading || sending}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="ec-code">验证码</Label>
        <div className="flex gap-2">
          <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v)}>
            <InputOTPGroup className="flex-1 justify-between">
              <InputOTPSlot index={0} className="flex-1" />
              <InputOTPSlot index={1} className="flex-1" />
              <InputOTPSlot index={2} className="flex-1" />
              <InputOTPSlot index={3} className="flex-1" />
              <InputOTPSlot index={4} className="flex-1" />
              <InputOTPSlot index={5} className="flex-1" />
            </InputOTPGroup>
          </InputOTP>
          <Button
            type="button"
            variant="outline"
            onClick={sendCode}
            disabled={sending || countdown > 0}
            className="shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : countdown > 0 ? <Timer className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {countdown > 0 ? `${countdown}s` : '获取'}
          </Button>
        </div>
        {sent && (
          <p className="text-[11px] text-muted-foreground">
            验证码已发送至 <span className="text-primary">{email}</span>，5 分钟内有效，一次性使用。
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="ec-remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
        <Label htmlFor="ec-remember" className="text-sm font-normal cursor-pointer">
          记住我
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        验证并登录
      </Button>
    </form>
  )
}
