'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Eye, EyeOff, Loader2, KeyRound, Lock, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'

export function ForcedPasswordChangeView({ email, reason }: { email: string; reason: string }) {
  const [oldPw, setOldPw] = React.useState('')
  const [newPw, setNewPw] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [showOld, setShowOld] = React.useState(false)
  const [showNew, setShowNew] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const { setPendingPasswordChange, setPending2fa, fetchMe } = useAuth()

  const strength = React.useMemo(() => {
    let s = 0
    if (newPw.length >= 8) s++
    if (newPw.length >= 12) s++
    if (/[A-Z]/.test(newPw) && /[a-z]/.test(newPw)) s++
    if (/[0-9]/.test(newPw) && /[^A-Za-z0-9]/.test(newPw)) s++
    return s
  }, [newPw])
  const strengthLabel = ['很弱', '弱', '一般', '较强', '强'][strength]
  const strengthColor = ['bg-red-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'][strength]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!oldPw || !newPw) return toast.error('请填写完整')
    if (newPw !== confirm) return toast.error('两次新密码不一致')
    if (newPw === oldPw) return toast.error('新密码不能与旧密码相同')
    setLoading(true)
    try {
      const data = await jsonFetch('/api/auth/change-expired-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      })
      if (data.stage === 'twofa_required') {
        toast.success('密码已修改，请完成双因素验证')
        setPendingPasswordChange(null)
        setPending2fa({ email: data.email, forceTwoFactor: data.forceTwoFactor })
      } else if (data.stage === 'success') {
        toast.success('密码修改成功，已登录')
        setPendingPasswordChange(null)
        await fetchMe()
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  function cancel() {
    setPendingPasswordChange(null)
    toast.info('已取消')
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 auth-gradient" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="relative z-10 w-full max-w-md">
        <Card className="border-border/60 shadow-xl backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-3 pb-2">
            <div className="mx-auto relative">
              <div className="absolute inset-0 bg-amber-500/30 blur-xl rounded-full" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg mx-auto">
                <ShieldAlert className="h-7 w-7" />
              </div>
            </div>
            <CardTitle className="text-xl">必须修改密码</CardTitle>
            <CardDescription>
              正在登录 <span className="text-primary font-medium">{email}</span>
              <br />
              {reason === 'admin_forced'
                ? '管理员已要求您在下次登录时修改密码'
                : '您的密码已过期，请设置新密码后继续'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>完成密码修改后才能进入系统。新密码需满足复杂度策略，且不能与最近使用过的密码重复。</span>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fp-old">当前密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="fp-old" type={showOld ? 'text' : 'password'} className="pl-9 pr-9" value={oldPw} onChange={(e) => setOldPw(e.target.value)} disabled={loading} />
                  <button type="button" onClick={() => setShowOld((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fp-new">新密码</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="fp-new" type={showNew ? 'text' : 'password'} className="pl-9 pr-9" value={newPw} onChange={(e) => setNewPw(e.target.value)} disabled={loading} />
                  <button type="button" onClick={() => setShowNew((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPw && (
                  <div className="space-y-1">
                    <Progress value={(strength / 4) * 100} className={`h-1.5 [&>div]:${strengthColor}`} />
                    <p className="text-[11px] text-muted-foreground">强度：{strengthLabel}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fp-confirm">确认新密码</Label>
                <Input id="fp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} />
                {confirm && newPw === confirm && (
                  <p className="text-[11px] text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />两次密码一致</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading || !oldPw || !newPw || !confirm}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <KeyRound className="h-4 w-4 mr-1.5" />
                修改并继续
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={cancel} disabled={loading}>
                取消
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
