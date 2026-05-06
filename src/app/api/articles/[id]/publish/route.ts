import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, articles, cmsConnections } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { cmsPublishQueue } from '@/lib/queue/queues'
import { checkUsageLimit } from '@/lib/billing/stripe'
import { z } from 'zod'

const schema = z.object({
  connectionId: z.string().uuid().optional()
})

export const POST = requireTenant(async (
  req: NextRequest,
  { params, tenant }
) => {
  const { id } = await params

  // Check usage limits
  const canPublish = await checkUsageLimit(tenant.tenantId)
  if (!canPublish) {
    return NextResponse.json(
      { error: 'Monthly post limit reached' },
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

  // Get article
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, id), eq(articles.tenantId, tenant.tenantId))
  })

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  if (!['approved', 'draft', 'pending_review'].includes(article.status!)) {
    return NextResponse.json(
      { error: `Cannot publish article with status: ${article.status}` },
      { status: 400 }
    )
  }

  // Get CMS connection
  let connectionId = result.data.connectionId

  if (!connectionId) {
    // Get default connection
    const defaultConnection = await db.query.cmsConnections.findFirst({
      where: and(
        eq(cmsConnections.tenantId, tenant.tenantId),
        eq(cmsConnections.isDefault, true),
        eq(cmsConnections.isActive, true)
      )
    })

    if (!defaultConnection) {
      return NextResponse.json(
        { error: 'No CMS connection configured. Please add a CMS connection first.' },
        { status: 400 }
      )
    }

    connectionId = defaultConnection.id
  }

  // Verify connection exists and is active
  const connection = await db.query.cmsConnections.findFirst({
    where: and(
      eq(cmsConnections.id, connectionId),
      eq(cmsConnections.tenantId, tenant.tenantId),
      eq(cmsConnections.isActive, true)
    )
  })

  if (!connection) {
    return NextResponse.json({ error: 'CMS connection not found or inactive' }, { status: 404 })
  }

  // Queue for publishing
  const job = await cmsPublishQueue.add('publish', {
    tenantId: tenant.tenantId,
    articleId: id,
    connectionId
  })

  // Update article status
  await db.update(articles)
    .set({
      status: 'publishing',
      cmsConnectionId: connectionId,
      updatedAt: new Date()
    })
    .where(eq(articles.id, id))

  return NextResponse.json({
    jobId: job.id,
    status: 'publishing',
    message: 'Article queued for publishing'
  })
})
