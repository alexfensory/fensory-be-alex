import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, brandCorpus } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { generateEmbeddings } from '@/lib/ai/embeddings'
import { z } from 'zod'

// GET - List corpus entries
export const GET = requireTenant(async (_req, { tenant }) => {
  const entries = await db.query.brandCorpus.findMany({
    where: eq(brandCorpus.tenantId, tenant.tenantId),
    orderBy: [desc(brandCorpus.createdAt)],
    columns: {
      id: true,
      sourceType: true,
      sourceUrl: true,
      title: true,
      metadata: true,
      crawledAt: true,
      createdAt: true
      // Exclude content and embedding for list view
    }
  })

  return NextResponse.json({ entries })
})

// POST - Add manual corpus entry
const createSchema = z.object({
  title: z.string().max(500),
  content: z.string().min(10),
  sourceType: z.enum(['website', 'document', 'manual', 'api']).default('manual'),
  sourceUrl: z.string().url().optional()
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

  const { title, content, sourceType, sourceUrl } = result.data

  // Generate embedding
  const embedding = await generateEmbeddings(content)

  const [entry] = await db.insert(brandCorpus).values({
    tenantId: tenant.tenantId,
    sourceType,
    sourceUrl,
    title,
    content,
    embedding,
    metadata: {
      wordCount: content.split(/\s+/).length
    }
  }).returning()

  return NextResponse.json({ entry }, { status: 201 })
})

// DELETE - Remove corpus entry
export const DELETE = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await db.delete(brandCorpus)
    .where(eq(brandCorpus.id, id))

  return NextResponse.json({ success: true })
})
