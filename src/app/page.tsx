'use client'

import * as React from 'react'
import { PlatformShell } from '@/components/platform/platform-shell'
import { useAuth } from '@/lib/auth-client'

export default function Home() {
  const { fetchMe } = useAuth()
  React.useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return <PlatformShell />
}
