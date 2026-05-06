import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, articles } from '@/lib/db'
import { eq, desc, and } from 'drizzle-orm'
import { z } from 'zod'

// GET - List articles
export const GET = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let whereClause = eq(articles.tenantId, tenant.tenantId)

  if (status) {
    whereClause = and(whereClause, eq(articles.status, status as typeof articles.$inferSelect['status']))!
  }

  const [articleList, totalCount] = await Promise.all([
    db.query.articles.findMany({
      where: whereClause,
      orderBy: [desc(articles.createdAt)],
      limit,
      offset,
      columns: {
        id: true,
        title: true,
        slug: true,
        status: true,
        qualityScore: true,
        wordCount: true,
        publishedAt: true,
        publishedUrl: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    db.$count(articles, whereClause)
  ])

  return NextResponse.json({
    articles: articleList,
    total: totalCount,
    limit,
    offset
  })
})

// GET single article
export const getArticle = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, id), eq(articles.tenantId, tenant.tenantId)),
    with: {
      topic: true
    }
  })

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({ article })
})

// PATCH - Update article
const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  status: z.enum([
    'draft', 'generating', 'pending_review', 'approved',
    'scheduled', 'publishing', 'published', 'error', 'archived'
  ]).optional(),
  cmsConnectionId: z.string().uuid().nullable().optional()
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

  // Recalculate word count if content changed
  let wordCount: number | undefined
  if (updates.content) {
    wordCount = updates.content.split(/\s+/).length
  }

  const [article] = await db.update(articles)
    .set({
      ...updates,
      wordCount: wordCount || undefined,
      updatedAt: new Date()
    })
    .where(and(eq(articles.id, id), eq(articles.tenantId, tenant.tenantId)))
    .returning()

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({ article })
})

// DELETE - Delete article
export const DELETE = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await db.delete(articles)
    .where(and(eq(articles.id, id), eq(articles.tenantId, tenant.tenantId)))

  return NextResponse.json({ success: true })
})
