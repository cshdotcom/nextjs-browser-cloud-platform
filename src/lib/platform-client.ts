'use client'

import * as React from 'react'
import { create } from 'zustand'

// ============================================================
// Platform API client + types
// ============================================================
// All business endpoints live under /api/platform/* and return the standard
// envelope { ok, code, msg, data, traceId }. `pfFetch` unwraps the envelope,
// throws on !ok, and returns `data` directly. Errors carry .code/.traceId.

export interface ApiEnvelope<T = unknown> {
  ok: boolean
  code?: string
  msg?: string
  data?: T
  traceId?: string
}

export class PlatformError extends Error {
  code: string
  traceId?: string
  status: number
  constructor(message: string, code = 'UNKNOWN', status = 500, traceId?: string) {
    super(message)
    this.code = code
    this.status = status
    this.traceId = traceId
  }
}

export async function pfFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      credentials: 'include',
    })
  } catch (err) {
    throw new PlatformError(
      err instanceof Error ? `网络请求失败: ${err.message}` : '网络请求失败',
      'NETWORK_ERROR',
      0,
    )
  }
  const text = await res.text()
  let body: ApiEnvelope<T>
  try {
    body = text ? (JSON.parse(text) as ApiEnvelope<T>) : ({} as ApiEnvelope<T>)
  } catch {
    throw new PlatformError(`响应解析失败 (HTTP ${res.status})`, 'PARSE_ERROR', res.status)
  }
  if (!res.ok || body.ok === false) {
    const msg = body.msg || body.code || `请求失败 (${res.status})`
    throw new PlatformError(msg, body.code || `HTTP_${res.status}`, res.status, body.traceId)
  }
  return body.data as T
}

// React hook: GET endpoint with loading/error/data, graceful on errors.
export function usePlatformFetch<T = unknown>(
  path: string | null,
  opts?: { deps?: unknown[]; skip?: boolean },
) {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(!opts?.skip && !!path)
  const [error, setError] = React.useState<PlatformError | null>(null)
  const deps = opts?.deps ? opts.deps : []
  const skip = opts?.skip

  const reload = React.useCallback(() => {
    if (!path || skip) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    pfFetch<T>(path)
      .then((d) => {
        if (alive) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof PlatformError ? e : new PlatformError(String(e)))
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [path, skip])

  React.useEffect(() => reload(), [reload, ...deps])

  return { data, loading, error, setData, reload }
}

// ============================================================
// Domain types — aligned with prisma schema
// ============================================================

export type ViewId =
  | 'dashboard'
  | 'workspaces'
  | 'singbox'
  | 'proxy'
  | 'templates'
  | 'scripts'
  | 'files'
  | 'users'
  | 'groups'
  | 'audit'
  | 'config'
  | 'schedule'
  | 'alerts'
  | 'recycle'
  | 'account'

export interface User {
  id: string
  username: string
  email: string
  displayName?: string | null
  role: 'superadmin' | 'admin' | 'user'
  emailVerified: boolean
  twoFactorEnabled: boolean
  status: string
  createdAt?: string
}

export interface UserGroup {
  id: string
  name: string
  description?: string | null
  parentId?: string | null
  enabled: boolean
  quota?: string | null
}

export interface Workspace {
  id: string
  name: string
  tags: string[] | null
  mode: 'cdp_light' | 'novnc_full'
  status: 'creating' | 'running' | 'idle' | 'stopped' | 'error' | 'expired'
  proxyNodeId: string | null
  proxyNodeName?: string | null
  singboxInstanceId: string | null
  singboxInstanceName?: string | null
  templateId?: string | null
  profileSnapshotId?: string | null
  ttlMinutes: number
  idleTimeoutMinutes: number
  userId: string
  ownerName?: string
  createdAt: string
  updatedAt: string
}

export interface SingboxInstance {
  id: string
  name: string
  description?: string | null
  tags: string[] | null
  cpuLimit: number
  memoryLimit: number
  dockerContainerId: string | null
  status: 'creating' | 'running' | 'restarting' | 'stopped' | 'error'
  hostNodeId: string | null
  hostNodeName?: string | null
  socksAddress: string | null
  configJson: string
  maxSessions: number
  trafficIn: number
  trafficOut: number
  cpuUsed?: number
  memoryUsed?: number
  createdAt: string
}

export interface ProxyNode {
  id: string
  name: string
  type: 'external' | 'internal_singbox'
  singboxInstanceId: string | null
  singboxInstanceName?: string | null
  socksAddress: string | null
  httpAddress: string | null
  status: 'active' | 'draining' | 'offline' | 'error'
  healthLatency: number | null
  tags: string[] | null
  weight: number
  groupId: string | null
  createdAt: string
}

export interface HostNode {
  id: string
  name: string
  dockerApiUrl: string
  cpuTotal: number
  memoryTotal: number
  cpuUsed: number
  memoryUsed: number
  status: 'active' | 'draining' | 'offline' | 'error'
  label?: string | null
}

export interface Template {
  id: string
  name: string
  visibility: 'private' | 'group' | 'global'
  ownerId: string
  ownerName?: string
  groupId: string | null
  parentId: string | null
  config: string
  createdAt: string
  updatedAt: string
}

export interface ScriptTemplate {
  id: string
  name: string
  sourceCode: string
  version: string
  enabled: boolean
  boundDomains: string[] | null
  createdAt: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  traceId: string | null
  operatorUserId: string | null
  operatorName: string
  operationType: string
  resourceType: string
  resourceId: string | null
  clientIp: string | null
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
}

export interface ApiToken {
  id: string
  name: string
  prefix: string
  scopes: string[] | null
  enabled: boolean
  expireAt: string | null
  lastUsedAt: string | null
  totalCalls: number
  createdAt: string
}

export interface SystemConfig {
  id: string
  key: string
  valueJson: string
  category: string
  description?: string | null
  updatedAt: string
}

export interface ConfigVersion {
  id: string
  configKey: string | null
  beforeJson: string | null
  afterJson: string | null
  operatorUserId: string | null
  operatorName?: string
  createdAt: string
}

export interface Alert {
  id: string
  title: string
  level: 'info' | 'warning' | 'critical'
  content: string | null
  resourceId: string | null
  resourceType: string | null
  triggerAt: string
  handleStatus: 'pending' | 'handled' | 'ignored'
  handledBy: string | null
  handledAt: string | null
  createdAt: string
}

export interface Notice {
  id: string
  title: string
  content: string | null
  read: boolean
  createdAt: string
}

export interface ScheduleTask {
  id: string
  name: string
  cronExpr: string
  enabled: boolean
  lastExecuteAt: string | null
  nextExecuteAt: string | null
  lastResult: string | null
  lastError: string | null
  consecutiveFailures: number
  createdAt: string
}

export interface ScheduleTaskLog {
  id: string
  taskId: string
  startedAt: string
  finishedAt: string | null
  result: string | null
  errorStack: string | null
}

export interface FileMeta {
  id: string
  name: string
  storageKey: string
  size: number
  mime: string
  userId: string | null
  ownerName?: string
  sessionId: string | null
  expireAt: string | null
  createdAt: string
}

export interface RecycleBinItem {
  id: string
  resourceType: string
  resourceId: string
  resourceSnapshot: string
  deletedBy: string | null
  deletedByUser?: { email?: string; displayName?: string | null } | null
  deletedAt: string
  expiresAt: string
}

// ============================================================
// Platform view store (single-route SPA)
// ============================================================

interface PlatformViewState {
  view: ViewId
  setView: (v: ViewId) => void
  // optional context (e.g. for jumping from list to detail)
  ctx: Record<string, unknown>
  setCtx: (c: Record<string, unknown>) => void
}

export const usePlatformView = create<PlatformViewState>((set) => ({
  view: 'dashboard',
  setView: (v) => set({ view: v }),
  ctx: {},
  setCtx: (c) => set({ ctx: c }),
}))

// ============================================================
// Helpers
// ============================================================

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export function parseJson<T = unknown>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 2 : i > 1 ? 1 : 0)} ${u[i]}`
}

export function formatRel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (isNaN(t)) return '—'
  const diff = t - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const suffix = diff >= 0 ? '后' : '前'
  if (days > 0) return `${days}天${suffix}`
  if (hours > 0) return `${hours}小时${suffix}`
  if (mins > 0) return `${mins}分钟${suffix}`
  return `${Math.floor(abs / 1000)}秒${suffix}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}
