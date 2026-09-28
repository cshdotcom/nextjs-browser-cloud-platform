'use client'

import * as React from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Boxes, Users, Server, Network, LayoutTemplate, FileText, Loader2 } from 'lucide-react'
import { pfFetch, usePlatformView, type ViewId } from '@/lib/platform-client'
import { cn } from '@/lib/utils'

interface SearchResult {
  type: 'workspace' | 'user' | 'singbox' | 'proxy' | 'template' | 'file'
  id: string
  title: string
  subtitle: string
  badge?: string
}

const TYPE_META: Record<SearchResult['type'], { label: string; icon: React.ComponentType<{ className?: string }>; view: ViewId }> = {
  workspace: { label: '工作区', icon: Boxes, view: 'workspaces' },
  user: { label: '用户', icon: Users, view: 'users' },
  singbox: { label: 'Sing-Box', icon: Server, view: 'singbox' },
  proxy: { label: '代理', icon: Network, view: 'proxy' },
  template: { label: '模板', icon: LayoutTemplate, view: 'templates' },
  file: { label: '文件', icon: FileText, view: 'files' },
}

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const { setView } = usePlatformView()

  // Keyboard shortcut: Cmd+K / Ctrl+K to open, Escape to close
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Debounced search
  React.useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        // Search across multiple resources in parallel
        const [workspaces, users, singboxes, proxies, templates] = await Promise.allSettled([
          pfFetch<{ items: Array<{ id: string; name: string; status: string }> }>(`/api/platform/workspaces?q=${encodeURIComponent(query)}&pageSize=5`),
          pfFetch<{ items: Array<{ id: string; username: string; email: string; displayName: string | null }> }>(`/api/platform/users?q=${encodeURIComponent(query)}&pageSize=5`),
          pfFetch<{ items: Array<{ id: string; name: string; status: string }> }>(`/api/platform/singbox-instances?q=${encodeURIComponent(query)}&pageSize=5`),
          pfFetch<{ items: Array<{ id: string; name: string; type: string }> }>(`/api/platform/proxy-nodes?q=${encodeURIComponent(query)}&pageSize=5`),
          pfFetch<{ items: Array<{ id: string; name: string }> }>(`/api/platform/templates?q=${encodeURIComponent(query)}&pageSize=5`),
        ])
        const out: SearchResult[] = []
        if (workspaces.status === 'fulfilled') {
          workspaces.value.items?.forEach((w) => out.push({ type: 'workspace', id: w.id, title: w.name, subtitle: w.status, badge: w.status }))
        }
        if (users.status === 'fulfilled') {
          users.value.items?.forEach((u) => out.push({ type: 'user', id: u.id, title: u.displayName || u.username, subtitle: u.email, badge: u.username }))
        }
        if (singboxes.status === 'fulfilled') {
          singboxes.value.items?.forEach((s) => out.push({ type: 'singbox', id: s.id, title: s.name, subtitle: s.status, badge: s.status }))
        }
        if (proxies.status === 'fulfilled') {
          proxies.value.items?.forEach((p) => out.push({ type: 'proxy', id: p.id, title: p.name, subtitle: p.type, badge: p.type }))
        }
        if (templates.status === 'fulfilled') {
          templates.value.items?.forEach((t) => out.push({ type: 'template', id: t.id, title: t.name, subtitle: '', badge: '' }))
        }
        setResults(out.slice(0, 20))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function handleSelect(r: SearchResult) {
    setOpen(false)
    setQuery('')
    setResults([])
    setView(TYPE_META[r.type].view)
  }

  // Group results by type
  const grouped = React.useMemo(() => {
    const map = new Map<SearchResult['type'], SearchResult[]>()
    results.forEach((r) => {
      const arr = map.get(r.type) || []
      arr.push(r)
      map.set(r.type, arr)
    })
    return Array.from(map.entries())
  }, [results])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-9 md:w-56 md:px-3 justify-start md:justify-between gap-2">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Search className="h-4 w-4" />
            <span className="hidden md:inline text-sm">全局搜索…</span>
          </span>
          <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[400px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="搜索工作区、用户、Sing-Box、代理…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && query.length < 2 && (
              <CommandEmpty>输入至少 2 个字符开始搜索</CommandEmpty>
            )}
            {!loading && query.length >= 2 && results.length === 0 && (
              <CommandEmpty>未找到匹配结果</CommandEmpty>
            )}
            {grouped.map(([type, items]) => {
              const meta = TYPE_META[type]
              const Icon = meta.icon
              return (
                <React.Fragment key={type}>
                  <CommandGroup heading={meta.label}>
                    {items.map((r) => {
                      const Icon = TYPE_META[r.type].icon
                      return (
                        <CommandItem
                          key={`${r.type}-${r.id}`}
                          value={`${r.type}-${r.id}`}
                          onSelect={() => handleSelect(r)}
                          className="gap-2"
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{r.title}</div>
                            {r.subtitle && <div className="text-[11px] text-muted-foreground truncate">{r.subtitle}</div>}
                          </div>
                          {r.badge && <Badge variant="outline" className="text-[9px] shrink-0">{r.badge}</Badge>}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                </React.Fragment>
              )
            })}
            {!loading && grouped.length > 0 && (
              <CommandGroup>
                <CommandItem disabled className="text-[10px] text-muted-foreground justify-center">
                  共 {results.length} 条结果 · 按资源类型分组
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
