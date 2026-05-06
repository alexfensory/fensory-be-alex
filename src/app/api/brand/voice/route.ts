import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { getBrandVoice, updateBrandVoice } from '@/lib/brand/voice'
import { db, brandCorpus } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { analyzeBrandVoice } from '@/lib/ai/claude'
import { z } from 'zod'

// GET - Get current brand voice profile
export const GET = requireTenant(async (_req, { tenant }) => {
  const voice = await getBrandVoice(tenant.tenantId)

  if (!voice) {
    return NextResponse.json({
      voice: null,
      message: 'No brand voice profile found. Crawl your website or add content to generate one.'
    })
  }

  return NextResponse.json({ voice })
})

// POST - Regenerate brand voice from corpus
export const POST = requireTenant(async (_req, { tenant }) => {
  // Get corpus content
  const corpus = await db.query.brandCorpus.findMany({
    where: eq(brandCorpus.tenantId, tenant.tenantId),
    columns: { content: true },
    limit: 20
  })

  if (corpus.length === 0) {
    return NextResponse.json(
      { error: 'No corpus content found. Add content or crawl your website first.' },
      { status: 400 }
    )
  }

  const contents = corpus.map(c => c.content)
  const voice = await analyzeBrandVoice(contents)

  await updateBrandVoice(tenant.tenantId, voice)

  return NextResponse.json({
    voice,
    message: 'Brand voice profile regenerated successfully'
  })
})

// PATCH - Update specific voice settings
const updateSchema = z.object({
  toneDescriptors: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  industryContext: z.string().optional(),
  doNotUse: z.array(z.string()).optional(),
  vocabulary: z.object({
    preferredTerms: z.array(z.string()).optional(),
    avoidTerms: z.array(z.string()).optional(),
    jargonLevel: z.enum(['none', 'light', 'moderate', 'heavy']).optional()
  }).optional()
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

  await updateBrandVoice(tenant.tenantId, result.data)

  const voice = await getBrandVoice(tenant.tenantId)

  return NextResponse.json({ voice })
})
