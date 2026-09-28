'use client'

import * as React from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'

// Side-by-side JSON diff viewer with primitive-level change highlighting.
// Tries to be tolerant: parses JSON strings into objects; falls back to raw text.

function safeParse(s: string | null | undefined): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

function flatten(o: unknown, prefix = ''): Map<string, { value: unknown; type: string }> {
  const out = new Map<string, { value: unknown; type: string }>()
  if (o === null || o === undefined) {
    if (prefix) out.set(prefix, { value: null, type: 'null' })
    return out
  }
  if (typeof o === 'object') {
    if (Array.isArray(o)) {
      o.forEach((v, i) => {
        const k = `${prefix}[${i}]`
        const sub = flatten(v, k)
        sub.forEach((val, key) => out.set(key, val))
      })
      if (o.length === 0) out.set(prefix, { value: '[]', type: 'empty' })
    } else {
      Object.entries(o as Record<string, unknown>).forEach(([k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k
        const sub = flatten(v, key)
        if (sub.size === 0) out.set(key, { value: v, type: typeof v })
        else sub.forEach((val, kk) => out.set(kk, val))
      })
      if (Object.keys(o).length === 0) out.set(prefix, { value: '{}', type: 'empty' })
    }
  } else {
    out.set(prefix || '(root)', { value: o, type: typeof o })
  }
  return out
}

function diffLines(
  beforeStr: string | null | undefined,
  afterStr: string | null | undefined,
): { key: string; before: string; after: string; added: boolean; removed: boolean; unchanged: boolean }[] {
  const b = safeParse(beforeStr)
  const a = safeParse(afterStr)
  const bf = flatten(b)
  const af = flatten(a)
  const keys = Array.from(new Set<string>([...bf.keys(), ...af.keys()])).sort()
  return keys.map((k) => {
    const bv = bf.get(k)
    const av = af.get(k)
    const bStr = bv ? JSON.stringify(bv.value) : ''
    const aStr = av ? JSON.stringify(av.value) : ''
    return {
      key: k,
      before: bStr,
      after: aStr,
      added: !bv && !!av,
      removed: !!bv && !av,
      unchanged: bStr === aStr,
    }
  })
}

function JsonBlock({ label, json, accent }: { label: string; json: string | null; accent: 'before' | 'after' }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  let pretty = '—'
  try {
    pretty = json ? JSON.stringify(safeParse(json), null, 2) : '—'
  } catch {
    pretty = json || '—'
  }
  return (
    <div className="flex-1 min-w-0">
      <div
        className={cn(
          'text-[10px] font-semibold uppercase tracking-wider px-2 py-1 border-b',
          accent === 'before'
            ? 'text-red-500 border-red-500/30 bg-red-500/5'
            : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5',
        )}
      >
        {label}
      </div>
      <div className="overflow-auto max-h-[28rem] text-[11px]">
        <SyntaxHighlighter
          language="json"
          style={isDark ? vscDarkPlus : oneLight}
          customStyle={{
            margin: 0,
            background: 'transparent',
            padding: '0.5rem',
            fontSize: '11px',
          }}
          wrapLongLines
        >
          {pretty}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

export function JsonDiffViewer({
  beforeJson,
  afterJson,
  className,
}: {
  beforeJson: string | null | undefined
  afterJson: string | null | undefined
  className?: string
}) {
  const rows = diffLines(beforeJson, afterJson)
  const changedRows = rows.filter((r) => !r.unchanged)
  const showDiff = changedRows.length > 0

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col md:flex-row gap-2 rounded-lg border border-border/60 overflow-hidden bg-muted/20">
        <JsonBlock label="变更前 (before)" json={beforeJson ?? null} accent="before" />
        <div className="hidden md:block w-px bg-border/60" />
        <JsonBlock label="变更后 (after)" json={afterJson ?? null} accent="after" />
      </div>

      {showDiff && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 bg-muted/40 text-muted-foreground border-b border-border/60">
            字段差异 ({changedRows.length})
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/30 backdrop-blur">
                <tr className="text-left">
                  <th className="px-3 py-1.5 font-medium text-muted-foreground">字段</th>
                  <th className="px-3 py-1.5 font-medium text-muted-foreground">变更前</th>
                  <th className="px-3 py-1.5 font-medium text-muted-foreground">变更后</th>
                  <th className="px-3 py-1.5 font-medium text-muted-foreground text-center">状态</th>
                </tr>
              </thead>
              <tbody>
                {changedRows.map((r) => (
                  <tr key={r.key} className="border-t border-border/40">
                    <td className="px-3 py-1.5 font-mono text-foreground/80 break-all">{r.key}</td>
                    <td className="px-3 py-1.5 font-mono text-red-500 dark:text-red-400 break-all">
                      {r.removed ? '∅' : r.before || '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-emerald-500 dark:text-emerald-400 break-all">
                      {r.added ? '∅' : r.after || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.added ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <Check className="h-3 w-3" /> 新增
                        </span>
                      ) : r.removed ? (
                        <span className="inline-flex items-center gap-1 text-red-500">
                          <X className="h-3 w-3" /> 删除
                        </span>
                      ) : (
                        <span className="text-amber-500">修改</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
