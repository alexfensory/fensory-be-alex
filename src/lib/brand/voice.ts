import { db, brandVoiceProfiles } from '@/lib/db'
import { eq } from 'drizzle-orm'
import type { BrandVoice } from '@/lib/ai/types'

export async function getBrandVoice(tenantId: string): Promise<BrandVoice | null> {
  const profile = await db.query.brandVoiceProfiles.findFirst({
    where: eq(brandVoiceProfiles.tenantId, tenantId)
  })

  if (!profile) {
    return null
  }

  return {
    toneDescriptors: profile.toneDescriptors,
    vocabulary: profile.vocabulary,
    styleGuidelines: profile.styleGuidelines,
    exampleSnippets: profile.exampleSnippets,
    doNotUse: profile.doNotUse,
    targetAudience: profile.targetAudience,
    industryContext: profile.industryContext
  }
}

export async function updateBrandVoice(
  tenantId: string,
  voice: Partial<BrandVoice>
): Promise<void> {
  const existing = await db.query.brandVoiceProfiles.findFirst({
    where: eq(brandVoiceProfiles.tenantId, tenantId)
  })

  if (existing) {
    await db.update(brandVoiceProfiles)
      .set({
        ...voice,
        updatedAt: new Date()
      })
      .where(eq(brandVoiceProfiles.tenantId, tenantId))
  } else {
    await db.insert(brandVoiceProfiles).values({
      tenantId,
      toneDescriptors: voice.toneDescriptors || [],
      vocabulary: voice.vocabulary || {},
      styleGuidelines: voice.styleGuidelines || [],
      exampleSnippets: voice.exampleSnippets || [],
      doNotUse: voice.doNotUse || [],
      targetAudience: voice.targetAudience || '',
      industryContext: voice.industryContext || ''
    })
  }
}
