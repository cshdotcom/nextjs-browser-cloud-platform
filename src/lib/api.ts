import { NextResponse } from 'next/server'
import crypto from 'crypto'

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

export function apiOk(data?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status })
}

export function parseJsonBody<T = Record<string, unknown>>(body: unknown): T {
  return body as T
}

// Parse label from UA
export function describeDevice(ua: string): string {
  let os = '未知系统'
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/iPhone/.test(ua)) os = 'iPhone'
  else if (/iPad/.test(ua)) os = 'iPad'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = '未知浏览器'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  return `${browser} · ${os}`
}

// Build a stable device id from UA + accept-language for stability
export function buildDeviceId(ua: string, acceptLang: string): string {
  const raw = `${ua}::${acceptLang}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}
