import { NextRequest, NextResponse } from 'next/server'
import { runMonthlyUsageReset } from '@/lib/cron/scheduler'

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }

  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonthlyUsageReset()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Usage reset cron error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
