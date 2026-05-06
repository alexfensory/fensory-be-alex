import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { articleGenerationQueue } from '@/lib/queue/queues'
import { checkUsageLimit } from '@/lib/billing/stripe'
import { z } from 'zod'

const schema = z.object({
  topicId: z.string().uuid(),
  briefId: z.string().uuid().optional()
})

export const POST = requireTenant(async (req, { tenant }) => {
  // Check usage limits
  const canGenerate = await checkUsageLimit(tenant.tenantId)
  if (!canGenerate) {
    return NextResponse.json(
      {
        error: 'Monthly post limit reached',
        used: tenant.postsUsedThisMonth,
        limit: tenant.monthlyPostLimit
      },
      { status: 429 }
    )
  }

  const body = await req.json()

  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { topicId, briefId } = result.data

  const job = await articleGenerationQueue.add('generate', {
    tenantId: tenant.tenantId,
    topicId,
    briefId
  })

  return NextResponse.json({
    jobId: job.id,
    status: 'queued',
    message: 'Article generation started'
  })
})
