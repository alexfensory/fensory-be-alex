import { NextRequest, NextResponse } from 'next/server'
import { runPerformanceSync } from '@/lib/cron/scheduler'

// Verify cron secret for Vercel Cron
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    // Allow in development
    return process.env.NODE_ENV === 'development'
  }

  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runPerformanceSync()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Performance sync cron error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
