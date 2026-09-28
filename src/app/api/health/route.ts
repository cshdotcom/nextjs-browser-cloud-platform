import { NextResponse } from 'next/server'

// GET /api/health — lightweight health check for Docker
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    port: process.env.PORT || '3000',
    cdpPort: process.env.CDP_SERVER_PORT || '9222',
  })
}
