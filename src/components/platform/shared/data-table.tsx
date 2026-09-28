'use client'

import * as React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState, ErrorState } from './empty-state'

export interface Column<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => string | number
  width?: string
  align?: 'left' | 'right' | 'center'
  className?: string
}

export interface FilterDef {
  key: string
  label: string
  options: { value: string; label: string }[]
}

interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  // search
  searchable?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (v: string) => void
  // filters
  filters?: FilterDef[]
  filterValues?: Record<string, string>
  onFilterChange?: (key: string, value: string) => void
  // sort
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string, dir: 'asc' | 'desc') => void
  // pagination
  pagination?: { page: number; pageSize: number; total: number }
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  // selection
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  // batch actions toolbar
  batchActions?: { label: string; onClick: (ids: string[]) => void; variant?: 'default' | 'destructive' | 'outline' }[]
  // toolbar extras
  toolbarExtra?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: React.ReactNode
  emptyAction?: { label: string; onClick: () => void }
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  searchable,
  searchPlaceholder = '搜索…',
  searchValue,
  onSearchChange,
  filters,
  filterValues,
  onFilterChange,
  sortKey,
  sortDir,
  onSort,
  pagination,
  onPageChange,
  onPageSizeChange,
  selectable,
  selectedIds = [],
  onSelectionChange,
  batchActions,
  toolbarExtra,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
}: DataTableProps<T>) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.includes(rowKey(r)))
  const someChecked = rows.some((r) => selectedIds.includes(rowKey(r))) && !allChecked

  function toggleAll() {
    if (!onSelectionChange) return
    if (allChecked) onSelectionChange([])
    else onSelectionChange(rows.map(rowKey))
  }
  function toggleRow(id: string) {
    if (!onSelectionChange) return
    if (selectedIds.includes(id)) onSelectionChange(selectedIds.filter((x) => x !== id))
    else onSelectionChange([...selectedIds, id])
  }

  const showToolbar = searchable || (filters && filters.length > 0) || toolbarExtra
  const showBatch = selectable && selectedIds.length > 0 && batchActions && batchActions.length > 0

  function handleSort(col: Column<T>) {
    if (!col.sortable || !onSort) return
    if (sortKey === col.key) onSort(col.key, sortDir === 'asc' ? 'desc' : 'asc')
    else onSort(col.key, 'asc')
  }

  const totalPages = pagination && pagination.pageSize > 0 ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex items-center gap-2 flex-wrap">
          {searchable && (
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue || ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          )}
          {filters?.map((f) => (
            <Select
              key={f.key}
              value={filterValues?.[f.key] || 'all'}
              onValueChange={(v) => onFilterChange?.(f.key, v === 'all' ? '' : v)}
            >
              <SelectTrigger size="sm" className="w-[140px] h-8">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{f.label}（全部）</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {toolbarExtra && <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>}
        </div>
      )}

      {showBatch && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs text-primary font-medium">已选 {selectedIds.length} 项</span>
          <div className="ml-auto flex items-center gap-1.5">
            {batchActions!.map((b) => (
              <Button
                key={b.label}
                size="sm"
                variant={b.variant || 'outline'}
                className="h-7 text-xs"
                onClick={() => b.onClick(selectedIds)}
              >
                {b.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox checked={allChecked || someChecked} onCheckedChange={toggleAll} aria-label="select-all" />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-3 py-2.5 text-left font-medium text-xs text-muted-foreground whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                    )}
                    style={{ width: col.width }}
                  >
                    {col.sortable ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort(col)}
                      >
                        {col.header}
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)}>
                    <LoadingState />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)}>
                    <ErrorState message={error} onRetry={onRetry} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)}>
                    <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} action={emptyAction} />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const id = rowKey(row)
                  const checked = selectedIds.includes(id)
                  return (
                    <tr key={id} className={cn('border-t border-border/40 hover:bg-muted/30 transition-colors', checked && 'bg-primary/5')}>
                      {selectable && (
                        <td className="px-3 py-2.5">
                          <Checkbox checked={checked} onCheckedChange={() => toggleRow(id)} aria-label={`select-${id}`} />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-3 py-2.5 align-middle',
                            col.align === 'right' && 'text-right',
                            col.align === 'center' && 'text-center',
                            col.className,
                          )}
                        >
                          {col.cell(row)}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/40 bg-muted/20 text-xs">
            <div className="text-muted-foreground">
              共 <span className="text-foreground font-medium">{pagination.total}</span> 条 · 第 {pagination.page}/{totalPages} 页
            </div>
            <div className="flex items-center gap-1.5">
              {onPageSizeChange && (
                <Select value={String(pagination.pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                  <SelectTrigger size="sm" className="h-7 w-[90px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s} 条/页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pagination.page <= 1} onClick={() => onPageChange?.(1)}>
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pagination.page <= 1} onClick={() => onPageChange?.(pagination.page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pagination.page >= totalPages} onClick={() => onPageChange?.(pagination.page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pagination.page >= totalPages} onClick={() => onPageChange?.(totalPages)}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
