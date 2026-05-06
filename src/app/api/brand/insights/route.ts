import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/clerk'
import { db, brandVoiceProfiles, brandCorpus, articles, topics } from '@/lib/db'
import { eq, desc, sql, count } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface VoiceInsight {
  portrait: string
  keyTraits: string[]
  lastUpdated: string
}

interface ThemeCard {
  name: string
  articleCount: number
  depth: 'deep' | 'developing' | 'thin'
  description: string
}

interface KnowledgeInsight {
  summary: string
  themes: ThemeCard[]
  gaps: string[]
  lastUpdated: string
}

interface MarketInsight {
  summary: string
  competitors: Array<{
    domain: string
    positioning: string
    recentActivity: string
  }>
  overlap: Array<{ theme: string; coverage: number }>
  emergingSignals: string[]
  lastUpdated: string
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext()

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = context

    // Get brand voice profile
    const voiceProfile = await db.query.brandVoiceProfiles.findFirst({
      where: eq(brandVoiceProfiles.tenantId, tenantId),
      orderBy: [desc(brandVoiceProfiles.createdAt)]
    })

    // Get corpus stats
    const corpusEntries = await db.query.brandCorpus.findMany({
      where: eq(brandCorpus.tenantId, tenantId)
    })

    // Get article stats by topic/theme
    const articlesByTopic = await db
      .select({
        topicId: articles.topicId,
        count: count()
      })
      .from(articles)
      .where(eq(articles.tenantId, tenantId))
      .groupBy(articles.topicId)

    // Get topics for theme analysis
    const topicsList = await db.query.topics.findMany({
      where: eq(topics.tenantId, tenantId)
    })

    // Build voice insight
    let voice: VoiceInsight | null = null
    if (voiceProfile) {
      voice = {
        portrait: voiceProfile.voiceSummary || await generateVoicePortrait(voiceProfile),
        keyTraits: voiceProfile.toneDescriptors || [],
        lastUpdated: voiceProfile.updatedAt?.toISOString() || new Date().toISOString()
      }
    }

    // Build knowledge insight
    const themes = buildThemes(topicsList, articlesByTopic)
    const knowledge: KnowledgeInsight = {
      summary: await generateKnowledgeSummary(corpusEntries.length, themes),
      themes,
      gaps: identifyContentGaps(themes),
      lastUpdated: new Date().toISOString()
    }

    // Build market insight (simplified - would need competitor data in production)
    const market: MarketInsight = {
      summary: 'Competitive analysis requires additional data sources. Connect your industry feeds to enable market intelligence.',
      competitors: [],
      overlap: themes.slice(0, 3).map(t => ({
        theme: t.name,
        coverage: t.articleCount > 10 ? 0.8 : t.articleCount > 5 ? 0.5 : 0.3
      })),
      emergingSignals: [],
      lastUpdated: new Date().toISOString()
    }

    return NextResponse.json({
      voice,
      knowledge,
      market
    })
  } catch (error) {
    console.error('Brand insights error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

async function generateVoicePortrait(voiceProfile: typeof brandVoiceProfiles.$inferSelect): Promise<string> {
  if (!voiceProfile.toneDescriptors || voiceProfile.toneDescriptors.length === 0) {
    return 'Brand voice profile not yet analyzed. Crawl your website to generate insights.'
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Based on these brand voice characteristics, write a brief 2-3 sentence portrait describing how this brand communicates:

Tone: ${voiceProfile.toneDescriptors.join(', ')}
Vocabulary patterns: ${JSON.stringify(voiceProfile.vocabularyPatterns || {})}
Style guidelines: ${voiceProfile.styleGuidelines?.join('; ') || 'None specified'}

Write in third person, focusing on the practical impact for readers.`
      }]
    })

    const textBlock = response.content.find(b => b.type === 'text')
    return textBlock?.text || 'Voice analysis in progress.'
  } catch {
    return voiceProfile.toneDescriptors?.join(', ') || 'Voice profile available.'
  }
}

function buildThemes(
  topicsList: typeof topics.$inferSelect[],
  articlesByTopic: Array<{ topicId: string | null; count: number }>
): ThemeCard[] {
  const topicMap = new Map(articlesByTopic.map(a => [a.topicId, a.count]))

  return topicsList
    .map(topic => {
      const articleCount = topicMap.get(topic.id) || 0
      let depth: 'deep' | 'developing' | 'thin' = 'thin'
      if (articleCount >= 10) depth = 'deep'
      else if (articleCount >= 5) depth = 'developing'

      return {
        name: topic.keyword,
        articleCount,
        depth,
        description: topic.briefTemplate || `Content cluster for ${topic.keyword}`
      }
    })
    .sort((a, b) => b.articleCount - a.articleCount)
    .slice(0, 6)
}

async function generateKnowledgeSummary(corpusSize: number, themes: ThemeCard[]): Promise<string> {
  const deepThemes = themes.filter(t => t.depth === 'deep').map(t => t.name)
  const developingThemes = themes.filter(t => t.depth === 'developing').map(t => t.name)

  if (corpusSize === 0) {
    return 'Your brand corpus is empty. Crawl your website or add documents to build your knowledge base.'
  }

  const parts = [`Your indexed corpus contains ${corpusSize} documents.`]

  if (deepThemes.length > 0) {
    parts.push(`Strong coverage in: ${deepThemes.join(', ')}.`)
  }

  if (developingThemes.length > 0) {
    parts.push(`Developing themes: ${developingThemes.join(', ')}.`)
  }

  return parts.join(' ')
}

function identifyContentGaps(themes: ThemeCard[]): string[] {
  const gaps: string[] = []

  const thinThemes = themes.filter(t => t.depth === 'thin')
  if (thinThemes.length > 0) {
    gaps.push(`Expand coverage on: ${thinThemes.map(t => t.name).join(', ')}`)
  }

  // Add generic recommendations
  gaps.push('Case studies with quantified outcomes')
  gaps.push('Comparison content vs. alternatives')

  return gaps.slice(0, 4)
}
