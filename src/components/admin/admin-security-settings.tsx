'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, Settings, KeyRound, Clock, Mail, ShieldCheck, Smartphone, AlertTriangle } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface Settings {
  allowRegistration: boolean
  requireEmailActivation: boolean
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireLowercase: boolean
  passwordRequireDigit: boolean
  passwordRequireSpecial: boolean
  passwordBlockWeakDictionary: boolean
  maxFailedLoginAttempts: number
  lockoutDurationMinutes: number
  emailCodeTtlMinutes: number
  emailCodeSendIntervalSeconds: number
  emailCodeMaxPerHour: number
  sessionMaxLifetimeHours: number
  sessionIdleTimeoutMinutes: number
  rememberSessionDays: number
  globalEnforceTwoFactor: boolean
  allowEmailCodeLogin: boolean
  trustedDeviceDays: number
  autoRevokeTokensOnSecurityChange: boolean
  enableAnomalyAlert: boolean
  passwordExpiryDays: number
  passwordExpiryWarningDays: number
  passwordHistoryCount: number
  enableLoginCaptcha: boolean
}

export function AdminSecuritySettings() {
  const [s, setS] = React.useState<Settings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await jsonFetch('/api/admin/security-settings')
      setS(d.settings)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      await jsonFetch('/api/admin/security-settings', { method: 'PUT', body: JSON.stringify(s) })
      toast.success('安全配置已保存')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !s) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}</div>
  }

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => p ? { ...p, [k]: v } : p)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存配置
        </Button>
      </div>

      {/* Registration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4 text-primary" />注册与激活</CardTitle>
          <CardDescription>控制用户注册入口与邮箱激活策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="开放用户注册" desc="关闭后前台不显示注册入口">
            <Switch checked={s.allowRegistration} onCheckedChange={(v) => update('allowRegistration', v)} />
          </Row>
          <Row label="需要邮箱激活" desc="新注册账号需通过邮箱验证码激活后才能登录">
            <Switch checked={s.requireEmailActivation} onCheckedChange={(v) => update('requireEmailActivation', v)} />
          </Row>
          <Row label="登录图形验证码" desc="密码登录、邮箱验证码发送、找回密码均需先通过图形验证码，防自动化爆破">
            <Switch checked={s.enableLoginCaptcha} onCheckedChange={(v) => update('enableLoginCaptcha', v)} />
          </Row>
        </CardContent>
      </Card>

      {/* Password policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" />密码复杂度策略</CardTitle>
          <CardDescription>注册与修改密码时强制校验</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">最小长度</Label>
              <Input type="number" min={6} max={64} value={s.passwordMinLength} onChange={(e) => update('passwordMinLength', parseInt(e.target.value) || 8)} />
            </div>
          </div>
          <Separator />
          <Row label="必须包含大写字母"><Switch checked={s.passwordRequireUppercase} onCheckedChange={(v) => update('passwordRequireUppercase', v)} /></Row>
          <Row label="必须包含小写字母"><Switch checked={s.passwordRequireLowercase} onCheckedChange={(v) => update('passwordRequireLowercase', v)} /></Row>
          <Row label="必须包含数字"><Switch checked={s.passwordRequireDigit} onCheckedChange={(v) => update('passwordRequireDigit', v)} /></Row>
          <Row label="必须包含特殊符号"><Switch checked={s.passwordRequireSpecial} onCheckedChange={(v) => update('passwordRequireSpecial', v)} /></Row>
          <Row label="禁止弱密码字典" desc="拦截 password / 123456 等常见弱密码"><Switch checked={s.passwordBlockWeakDictionary} onCheckedChange={(v) => update('passwordBlockWeakDictionary', v)} /></Row>
          <Separator />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">密码过期天数（0=禁用）</Label>
              <Input type="number" min={0} max={365} value={s.passwordExpiryDays} onChange={(e) => update('passwordExpiryDays', parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">过期提前提醒（天）</Label>
              <Input type="number" min={1} max={30} value={s.passwordExpiryWarningDays} onChange={(e) => update('passwordExpiryWarningDays', parseInt(e.target.value) || 7)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">禁止重用历史（0=禁用）</Label>
              <Input type="number" min={0} max={24} value={s.passwordHistoryCount} onChange={(e) => update('passwordHistoryCount', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">设置密码过期天数后，超过该天数未修改密码的用户登录时将被强制修改；禁止重用历史会拦截与最近 N 次重复的密码。</p>
        </CardContent>
      </Card>

      {/* Lockout */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />登录锁定策略</CardTitle>
          <CardDescription>密码错误次数限制与临时锁定</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">连续错误阈值</Label>
            <Input type="number" min={3} max={20} value={s.maxFailedLoginAttempts} onChange={(e) => update('maxFailedLoginAttempts', parseInt(e.target.value) || 5)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">锁定时长（分钟）</Label>
            <Input type="number" min={1} max={1440} value={s.lockoutDurationMinutes} onChange={(e) => update('lockoutDurationMinutes', parseInt(e.target.value) || 15)} />
          </div>
        </CardContent>
      </Card>

      {/* Email code */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />邮箱验证码</CardTitle>
          <CardDescription>免密登录与找回密码验证码策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="允许邮箱验证码登录" desc="关闭后前台不显示验证码登录 Tab"><Switch checked={s.allowEmailCodeLogin} onCheckedChange={(v) => update('allowEmailCodeLogin', v)} /></Row>
          <Separator />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">有效期（分钟）</Label>
              <Input type="number" min={1} max={60} value={s.emailCodeTtlMinutes} onChange={(e) => update('emailCodeTtlMinutes', parseInt(e.target.value) || 5)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">发送间隔（秒）</Label>
              <Input type="number" min={10} max={3600} value={s.emailCodeSendIntervalSeconds} onChange={(e) => update('emailCodeSendIntervalSeconds', parseInt(e.target.value) || 60)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">每小时上限</Label>
              <Input type="number" min={1} max={100} value={s.emailCodeMaxPerHour} onChange={(e) => update('emailCodeMaxPerHour', parseInt(e.target.value) || 10)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />会话超时策略</CardTitle>
          <CardDescription>控制会话最大存活与闲置登出</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">最大存活（小时）</Label>
            <Input type="number" min={1} max={720} value={s.sessionMaxLifetimeHours} onChange={(e) => update('sessionMaxLifetimeHours', parseInt(e.target.value) || 24)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">闲置登出（分钟）</Label>
            <Input type="number" min={5} max={1440} value={s.sessionIdleTimeoutMinutes} onChange={(e) => update('sessionIdleTimeoutMinutes', parseInt(e.target.value) || 60)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">记住我时长（天）</Label>
            <Input type="number" min={1} max={90} value={s.rememberSessionDays} onChange={(e) => update('rememberSessionDays', parseInt(e.target.value) || 30)} />
          </div>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />双因素认证策略</CardTitle>
          <CardDescription>全局 2FA 强制策略与受信任设备</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="全局强制 2FA" desc="开启后所有未设置 2FA 的用户登录后强制跳转 2FA 设置页">
            <Switch checked={s.globalEnforceTwoFactor} onCheckedChange={(v) => update('globalEnforceTwoFactor', v)} />
          </Row>
          <Row label="账号安全变更自动作废 API Token" desc="修改密码/重置 2FA/禁用账号时自动撤销该用户全部 API Token">
            <Switch checked={s.autoRevokeTokensOnSecurityChange} onCheckedChange={(v) => update('autoRevokeTokensOnSecurityChange', v)} />
          </Row>
          <Row label="异常登录告警" desc="异地新 IP / 陌生 UA 登录时向用户邮箱发送风险提醒">
            <Switch checked={s.enableAnomalyAlert} onCheckedChange={(v) => update('enableAnomalyAlert', v)} />
          </Row>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />受信任设备有效期（天）</Label>
            <Input type="number" min={1} max={365} value={s.trustedDeviceDays} onChange={(e) => update('trustedDeviceDays', parseInt(e.target.value) || 30)} className="max-w-40" />
          </div>
          <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 flex items-start gap-1.5">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">提示</Badge>
            <span>用户组级别可在「用户组」标签单独开启「强制 2FA」，并可选择是否继承全局策略。</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  )
}
