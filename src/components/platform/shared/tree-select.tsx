'use client'

import * as React from 'react'
import { Check, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
}

interface TreeSelectProps {
  nodes: TreeNode[]
  value?: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TreeSelect({ nodes, value, onChange, placeholder = '选择…', disabled, className }: TreeSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function findLabel(list: TreeNode[], id: string): string | null {
    for (const n of list) {
      if (n.id === id) return n.label
      if (n.children) {
        const r = findLabel(n.children, id)
        if (r) return r
      }
    }
    return null
  }
  const selectedLabel = value ? findLabel(nodes, value) : null

  function renderNode(n: TreeNode, depth = 0) {
    const isExpanded = expanded[n.id] ?? depth < 1
    const hasChildren = !!n.children && n.children.length > 0
    const isSelected = n.id === value
    return (
      <div key={n.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 pr-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent/60',
            isSelected && 'bg-primary/10 text-primary',
          )}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setExpanded((s) => ({ ...s, [n.id]: !isExpanded }))
            onChange(n.id)
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )
          ) : null}
          <span className="truncate flex-1">{n.label}</span>
          {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
        </div>
        {hasChildren && isExpanded && (
          <div>{n.children!.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
          {selectedLabel || placeholder}
        </span>
        <ChevronRight className={cn('h-4 w-4 opacity-50 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-72 overflow-auto p-1 scrollbar-thin">
          {nodes.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">无可用节点</div>
          ) : (
            nodes.map((n) => renderNode(n, 0))
          )}
        </div>
      )}
    </div>
  )
}
