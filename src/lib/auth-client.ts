'use client'

import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
  emailVerified: boolean
  twoFactorEnabled: boolean
  status: string
}

export interface PasswordInfo {
  changedAt: string | null
  mustChange: boolean
  expiringSoon: boolean
  expired: boolean
  daysUntilExpiry: number | null
  expiryDays: number
}

export interface AuthState {
  authenticated: boolean
  loading: boolean
  user: AuthUser | null
  needsTwoFactorSetup: boolean
  passwordInfo: PasswordInfo | null
  // pending 2FA flow state (client-side)
  pending2fa: { email: string; forceTwoFactor: boolean } | null
  // forced password change flow state
  pendingPasswordChange: { email: string; reason: string } | null
  // current view
  view: string
  setView: (v: string) => void
  fetchMe: () => Promise<void>
  setPending2fa: (p: { email: string; forceTwoFactor: boolean } | null) => void
  setPendingPasswordChange: (p: { email: string; reason: string } | null) => void
  logout: () => Promise<void>
  setUser: (u: AuthUser | null) => void
}

async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }))
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `请求失败 (${res.status})`), { status: res.status, data })
  }
  return data
}

export const useAuth = create<AuthState>((set, get) => ({
  authenticated: false,
  loading: true,
  user: null,
  needsTwoFactorSetup: false,
  passwordInfo: null,
  pending2fa: null,
  pendingPasswordChange: null,
  view: 'dashboard',
  setView: (v) => set({ view: v }),
  async fetchMe() {
    try {
      const data = await jsonFetch('/api/auth/me')
      set({
        authenticated: !!data.authenticated,
        user: data.user || null,
        needsTwoFactorSetup: data.needsTwoFactorSetup || false,
        passwordInfo: data.password || null,
        loading: false,
      })
      if (data.needsTwoFactorSetup && data.authenticated) {
        set({ view: 'account-security' })
      }
    } catch {
      set({ authenticated: false, user: null, passwordInfo: null, loading: false })
    }
  },
  setPending2fa: (p) => set({ pending2fa: p }),
  setPendingPasswordChange: (p) => set({ pendingPasswordChange: p }),
  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    set({ authenticated: false, user: null, pending2fa: null, pendingPasswordChange: null, passwordInfo: null, view: 'auth' })
  },
  setUser: (u) => set({ user: u, authenticated: !!u }),
}))

export { jsonFetch }
