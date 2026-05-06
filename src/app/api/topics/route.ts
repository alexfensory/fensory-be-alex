import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, topics } from '@/lib/db'
import { eq, desc, and } from 'drizzle-orm'
import { generateSlug } from '@/lib/utils/slug'
import { z } from 'zod'

// GET - List topics
export const GET = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const lane = searchParams.get('lane')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let whereClause = eq(topics.tenantId, tenant.tenantId)

  if (status) {
    whereClause = and(whereClause, eq(topics.status, status as typeof topics.$inferSelect['status']))!
  }
  if (lane) {
    whereClause = and(whereClause, eq(topics.lane, lane as typeof topics.$inferSelect['lane']))!
  }

  const [topicList, totalCount] = await Promise.all([
    db.query.topics.findMany({
      where: whereClause,
      orderBy: [desc(topics.priority), desc(topics.createdAt)],
      limit,
      offset
    }),
    db.$count(topics, whereClause)
  ])

  return NextResponse.json({
    topics: topicList,
    total: totalCount,
    limit,
    offset
  })
})

// POST - Create topic
const createSchema = z.object({
  title: z.string().min(1).max(500),
  lane: z.enum(['standard', 'pillar', 'cluster', 'newsjacking']).default('standard'),
  keywords: z.array(z.string()).optional(),
  priority: z.number().min(0).max(100).default(50),
  pillarId: z.string().uuid().optional(),
  scheduledFor: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional()
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

  const { title, lane, keywords, priority, pillarId, scheduledFor, metadata } = result.data

  const [topic] = await db.insert(topics).values({
    tenantId: tenant.tenantId,
    title,
    slug: generateSlug(title),
    lane,
    keywords,
    priority,
    pillarId,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
    metadata,
    status: 'discovered'
  }).returning()

  return NextResponse.json({ topic }, { status: 201 })
})

// PATCH - Update topic
const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['discovered', 'queued', 'in_progress', 'completed', 'skipped']).optional(),
  priority: z.number().min(0).max(100).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  keywords: z.array(z.string()).optional()
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

  const [topic] = await db.update(topics)
    .set({
      ...updates,
      scheduledFor: updates.scheduledFor ? new Date(updates.scheduledFor) : updates.scheduledFor
    })
    .where(and(eq(topics.id, id), eq(topics.tenantId, tenant.tenantId)))
    .returning()

  if (!topic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
  }

  return NextResponse.json({ topic })
})

// DELETE - Delete topic
export const DELETE = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await db.delete(topics)
    .where(and(eq(topics.id, id), eq(topics.tenantId, tenant.tenantId)))

  return NextResponse.json({ success: true })
})
