import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { brandCrawlQueue } from '@/lib/queue/queues'
import { z } from 'zod'

const schema = z.object({
  url: z.string().url(),
  depth: z.number().min(1).max(5).optional(),
  maxPages: z.number().min(1).max(100).optional()
})

export const POST = requireTenant(async (req, { tenant }) => {
  const body = await req.json()

  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { url, depth, maxPages } = result.data

  const job = await brandCrawlQueue.add('crawl', {
    tenantId: tenant.tenantId,
    url,
    depth: depth || 3,
    maxPages: maxPages || 50
  })

  return NextResponse.json({
    jobId: job.id,
    status: 'queued',
    message: `Crawling ${url} - this may take a few minutes`
  })
})
