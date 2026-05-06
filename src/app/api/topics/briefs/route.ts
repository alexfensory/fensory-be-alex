import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, articleBriefs, topics } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { briefGenerationQueue } from '@/lib/queue/queues'
import { z } from 'zod'

// GET - List briefs
export const GET = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const topicId = searchParams.get('topicId')
  const status = searchParams.get('status')

  let whereClause = eq(articleBriefs.tenantId, tenant.tenantId)

  if (topicId) {
    whereClause = and(whereClause, eq(articleBriefs.topicId, topicId))!
  }
  if (status) {
    whereClause = and(whereClause, eq(articleBriefs.status, status as typeof articleBriefs.$inferSelect['status']))!
  }

  const briefs = await db.query.articleBriefs.findMany({
    where: whereClause,
    orderBy: [desc(articleBriefs.createdAt)],
    with: {
      topic: true
    }
  })

  return NextResponse.json({ briefs })
})

// POST - Create or generate brief
const createSchema = z.object({
  topicId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  targetWordCount: z.number().min(500).max(5000).optional(),
  outline: z.array(z.object({
    heading: z.string(),
    level: z.number().min(1).max(4),
    keyPoints: z.array(z.string()).optional()
  })).optional(),
  autoGenerate: z.boolean().default(false)
})

export const POST = requireTenant(async (req, { tenant }) => {
  const body = await req.json()

  const result = createSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { topicId, title, targetWordCount, outline, autoGenerate } = result.data

  // Verify topic exists
  const topic = await db.query.topics.findFirst({
    where: and(eq(topics.id, topicId), eq(topics.tenantId, tenant.tenantId))
  })

  if (!topic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
  }

  if (autoGenerate) {
    // Queue brief generation
    const job = await briefGenerationQueue.add('generate', {
      tenantId: tenant.tenantId,
      topicId
    })

    return NextResponse.json({
      jobId: job.id,
      status: 'generating',
      message: 'Brief generation started'
    })
  }

  // Create manual brief
  const [brief] = await db.insert(articleBriefs).values({
    tenantId: tenant.tenantId,
    topicId,
    title: title || topic.title,
    targetWordCount: targetWordCount || 1500,
    outline: outline || [],
    status: 'draft'
  }).returning()

  return NextResponse.json({ brief }, { status: 201 })
})

// PATCH - Update brief
const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  targetWordCount: z.number().min(500).max(5000).optional(),
  outline: z.array(z.object({
    heading: z.string(),
    level: z.number().min(1).max(4),
    keyPoints: z.array(z.string()).optional()
  })).optional(),
  status: z.enum(['draft', 'approved', 'generating', 'complete']).optional()
})

export const PATCH = requireTenant(async (req, { tenant }) => {
  const body = await req.json()

  const result = updateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { id, ...updates } = result.data

  const [brief] = await db.update(articleBriefs)
    .set(updates)
    .where(and(eq(articleBriefs.id, id), eq(articleBriefs.tenantId, tenant.tenantId)))
    .returning()

  if (!brief) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  return NextResponse.json({ brief })
})
