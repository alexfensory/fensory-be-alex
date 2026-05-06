import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {}

  // Check database
  const dbStart = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    checks.database = { status: 'ok', latency: Date.now() - dbStart }
  } catch (error) {
    checks.database = { status: 'error', error: (error as Error).message }
  }

  // Overall status
  const allOk = Object.values(checks).every(c => c.status === 'ok')

  return NextResponse.json({
    status: allOk ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    checks
  }, { status: allOk ? 200 : 503 })
}
