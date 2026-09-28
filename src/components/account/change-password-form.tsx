'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Eye, EyeOff, Loader2, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'

export function ChangePasswordForm() {
  const { user } = useAuth()
  const [oldPw, setOldPw] = React.useState('')
  const [newPw, setNewPw] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [twofa, setTwofa] = React.useState('')
  const [showOld, setShowOld] = React.useState(false)
  const [showNew, setShowNew] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  // strength meter (simple client-side; real policy enforced server-side)
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
      const data = await jsonFetch('/api/account/password', {
        method: 'POST',
        body: JSON.stringify({
          oldPassword: oldPw,
          newPassword: newPw,
          twofaCode: twofa || undefined,
        }),
      })
      toast.success(`密码修改成功，已下线 ${data.sessionsRevoked || 0} 个其他设备${data.tokensRevoked ? `，撤销 ${data.tokensRevoked} 个 API Token` : ''}`)
      setOldPw(''); setNewPw(''); setConfirm(''); setTwofa('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cp-old">旧密码</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="cp-old" type={showOld ? 'text' : 'password'} className="pl-9 pr-9" value={oldPw} onChange={(e) => setOldPw(e.target.value)} disabled={loading} />
          <button type="button" onClick={() => setShowOld((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
            {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cp-new">新密码</Label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="cp-new" type={showNew ? 'text' : 'password'} className="pl-9 pr-9" value={newPw} onChange={(e) => setNewPw(e.target.value)} disabled={loading} />
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
        <Label htmlFor="cp-confirm">确认新密码</Label>
        <Input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} />
      </div>

      {user?.twoFactorEnabled && (
        <div className="space-y-2">
          <Label htmlFor="cp-2fa">2FA 验证码</Label>
          <Input id="cp-2fa" inputMode="numeric" maxLength={6} placeholder="6 位动态验证码" value={twofa} onChange={(e) => setTwofa(e.target.value.replace(/\D/g, ''))} disabled={loading} />
          <p className="text-[11px] text-muted-foreground">您已开启 2FA，修改密码需额外二次校验。</p>
        </div>
      )}

      <Button type="submit" disabled={loading || !oldPw || !newPw || !confirm}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        <ShieldCheck className="h-4 w-4 mr-1.5" />
        确认修改
      </Button>
    </form>
  )
}
