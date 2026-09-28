'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import { NumberInput } from './shared/number-input'
import { ConfirmDialog } from './shared/confirm-dialog'
import { JsonDiffViewer } from './shared/json-diff-viewer'
import { pfFetch, usePlatformFetch, formatDateTime, type SystemConfig, type ConfigVersion } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Settings, Save, History, RefreshCw, Loader2, RotateCcw } from 'lucide-react'

const CATEGORIES = [
  { id: 'ui', label: '界面' },
  { id: 'system', label: '系统' },
  { id: 'session', label: '会话' },
  { id: 'security', label: '安全' },
  { id: 'rateLimit', label: '限流' },
  { id: 'quota', label: '配额' },
  { id: 'alert', label: '告警' },
  { id: 'storage', label: '存储' },
  { id: 'backup', label: '备份' },
  { id: 'token', label: 'Token' },
  { id: 'workspace', label: '工作区' },
]

function detectType(value: unknown, description?: string | null): 'string' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  // try JSON — only treat as json for object/array
  try {
    const v = typeof value === 'string' ? JSON.parse(value) : value
    if (v !== null && typeof v === 'object') return 'json'
  } catch {}
  if (description && /JSON|json|配置/.test(description)) return 'json'
  return 'string'
}

export function ConfigView() {
  const [activeCat, setActiveCat] = React.useState('system')
  const path = `/api/platform/config?category=${activeCat}`
  const { data, loading, error, reload } = usePlatformFetch<{ items: SystemConfig[] }>(path, { deps: [activeCat] })
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState<string | null>(null)
  const [historyKey, setHistoryKey] = React.useState<string | null>(null)
  const [rollbackVersion, setRollbackVersion] = React.useState<ConfigVersion | null>(null)

  const items = data?.items || []

  React.useEffect(() => {
    setDrafts({})
  }, [activeCat])

  function getDraft(c: SystemConfig): string {
    if (drafts[c.key] !== undefined) return drafts[c.key]
    // unwrap the JSON-encoded valueJson into a friendly string
    try {
      const v = JSON.parse(c.valueJson)
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      return JSON.stringify(v, null, 2)
    } catch {
      return c.valueJson
    }
  }

  function setDraft(k: string, v: string) {
    setDrafts((s) => ({ ...s, [k]: v }))
  }

  async function save(c: SystemConfig) {
    const draft = getDraft(c)
    setSaving(c.key)
    try {
      // Try to wrap as appropriate JSON value
      let valueJson: string
      const type = detectType(JSON.parse(c.valueJson), c.description)
      if (type === 'boolean') valueJson = JSON.stringify(draft === 'true')
      else if (type === 'number') valueJson = JSON.stringify(Number(draft))
      else if (type === 'json') {
        // validate
        JSON.parse(draft)
        valueJson = draft
      } else valueJson = JSON.stringify(draft)

      await pfFetch(`/api/platform/config/${encodeURIComponent(c.key)}`, {
        method: 'PUT',
        body: JSON.stringify({ valueJson }),
      })
      toast.success(`${c.key} 已保存`)
      setDrafts((s) => { const n = { ...s }; delete n[c.key]; return n })
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="系统设置"
        description="全部配置以 key-value 存储，每次修改生成版本快照，可回滚。环境变量可覆盖数据库配置。"
        icon={<Settings className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <Tabs value={activeCat} onValueChange={setActiveCat}>
        <TabsList className="w-full overflow-x-auto flex-wrap h-auto">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="text-xs">{c.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCat} className="mt-3">
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />)}</div>
          ) : error ? (
            <div className="text-center py-10 text-sm text-destructive">{error.message}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">该分类下暂无配置项</div>
          ) : (
            <div className="space-y-3">
              {items.map((c) => {
                const type = detectType(JSON.parse(c.valueJson), c.description)
                const draft = getDraft(c)
                const dirty = drafts[c.key] !== undefined
                return (
                  <Card key={c.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm font-mono">{c.key}</CardTitle>
                        <Badge variant="outline" className="text-[9px]">{type}</Badge>
                        <Badge variant="outline" className="text-[9px]">{c.category}</Badge>
                        {dirty && <Badge className="text-[9px] bg-amber-500/20 text-amber-600 border-amber-500/30">未保存</Badge>}
                        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setHistoryKey(c.key)}>
                          <History className="h-3 w-3" />
                          版本历史
                        </Button>
                      </div>
                      {c.description && <CardDescription className="text-xs">{c.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          {type === 'boolean' ? (
                            <div className="flex items-center gap-2 h-9">
                              <Switch checked={draft === 'true'} onCheckedChange={(v) => setDraft(c.key, String(v))} />
                              <span className="text-sm text-muted-foreground">{draft === 'true' ? '已启用' : '已禁用'}</span>
                            </div>
                          ) : type === 'number' ? (
                            <NumberInput
                              value={Number(draft) || 0}
                              onValueChange={(v) => setDraft(c.key, String(v ?? 0))}
                              step={0.001}
                            />
                          ) : type === 'json' ? (
                            <Textarea
                              value={draft}
                              onChange={(e) => setDraft(c.key, e.target.value)}
                              rows={Math.min(12, Math.max(3, draft.split('\n').length))}
                              className="font-mono text-xs"
                            />
                          ) : (
                            <Input value={draft} onChange={(e) => setDraft(c.key, e.target.value)} className="text-sm" />
                          )}
                          <p className="text-[10px] text-muted-foreground">最近更新: {formatDateTime(c.updatedAt)}</p>
                        </div>
                        <Button size="sm" onClick={() => save(c)} disabled={!dirty || saving === c.key}>
                          {saving === c.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          保存
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <HistoryDrawer
        configKey={historyKey}
        onClose={() => setHistoryKey(null)}
        onRollback={(v) => { setRollbackVersion(v); setHistoryKey(null) }}
      />

      <ConfirmDialog
        open={!!rollbackVersion}
        onOpenChange={(o) => !o && setRollbackVersion(null)}
        title="回滚到该版本？"
        description={`将把配置 ${rollbackVersion?.configKey} 回滚到 ${rollbackVersion ? formatDateTime(rollbackVersion.createdAt) : ''} 的快照。会生成新的版本记录。`}
        confirmText="确认回滚"
        destructive
        confirmTextMatch="回滚"
        loading={false}
        onConfirm={async () => {
          if (!rollbackVersion) return
          try {
            await pfFetch(`/api/platform/config/${encodeURIComponent(rollbackVersion.configKey || '')}/rollback`, {
              method: 'POST',
              body: JSON.stringify({ versionId: rollbackVersion.id }),
            })
            toast.success('已回滚')
            setRollbackVersion(null)
            reload()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '回滚失败')
          }
        }}
      />
    </div>
  )
}

function HistoryDrawer({
  configKey, onClose, onRollback,
}: { configKey: string | null; onClose: () => void; onRollback: (v: ConfigVersion) => void }) {
  const { data, loading, error } = usePlatformFetch<{ items: ConfigVersion[] }>(
    configKey ? `/api/platform/config/${encodeURIComponent(configKey)}/versions` : null,
  )

  return (
    <Drawer open={!!configKey} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            版本历史 — <code className="font-mono text-sm">{configKey}</code>
          </DrawerTitle>
          <DrawerDescription>每次修改自动生成不可变快照</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 overflow-y-auto scrollbar-thin space-y-2">
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded bg-muted/40 animate-pulse" />)}</div>
          ) : error ? (
            <div className="text-center py-6 text-sm text-destructive">{error.message}</div>
          ) : !data?.items || data.items.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">暂无历史版本</div>
          ) : (
            data.items.map((v, idx) => (
              <div key={v.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <span className="font-medium">#{data.items.length - idx}</span>
                  <span className="text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                  {v.operatorName && <Badge variant="outline" className="text-[9px]">{v.operatorName}</Badge>}
                  <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => onRollback(v)}>
                    <RotateCcw className="h-3 w-3" />
                    回滚
                  </Button>
                </div>
                <JsonDiffViewer beforeJson={v.beforeJson} afterJson={v.afterJson} />
              </div>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
