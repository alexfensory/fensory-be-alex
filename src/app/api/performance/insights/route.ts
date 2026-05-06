import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/clerk'
import { db, articles, performanceSnapshots } from '@/lib/db'
import { eq, desc, and, gte, sql } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface ArticleInsight {
  articleId: string
  title: string
  slug: string
  publishedAt: string
  targetQuery?: string
  trajectory: Array<{ week: number; position: number }>
  generatedRead: string
  status: 'climbing' | 'stable' | 'declining' | 'new'
  position: number
  previousPosition: number
  clicks: number
  impressions: number
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low'
  action: string
  reason: string
  articleId?: string
  articleTitle?: string
  affordance: string
}

interface PerformanceSnapshot {
  totalArticles: number
  pageOneCount: number
  pageOnePercent: number
  climbingCount: number
  climbingEta?: string
  voiceMatchAvg: number
  voiceMatchRange: { min: number; max: number }
  timeWindow: '7d' | '28d' | '90d' | 'all'
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext()

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = context
    const url = new URL(req.url)
    const timeWindow = (url.searchParams.get('window') || '28d') as '7d' | '28d' | '90d' | 'all'

    // Calculate date range
    const now = new Date()
    let startDate = new Date(0)
    if (timeWindow === '7d') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    else if (timeWindow === '28d') startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)
    else if (timeWindow === '90d') startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Get published articles
    const publishedArticles = await db.query.articles.findMany({
      where: and(
        eq(articles.tenantId, tenantId),
        eq(articles.status, 'published')
      ),
      orderBy: [desc(articles.publishedAt)]
    })

    // Get performance data
    const performanceData = await db.query.performanceSnapshots.findMany({
      where: and(
        eq(performanceSnapshots.tenantId, tenantId),
        gte(performanceSnapshots.date, startDate)
      ),
      orderBy: [desc(performanceSnapshots.date)]
    })

    // Build article insights
    const articleInsights = await buildArticleInsights(publishedArticles, performanceData)

    // Calculate snapshot metrics
    const snapshot = calculateSnapshot(articleInsights, timeWindow)

    // Generate headline insight
    const headline = await generateHeadlineInsight(snapshot, articleInsights)

    // Generate recommendations
    const recommendations = generateRecommendations(articleInsights, snapshot)

    return NextResponse.json({
      headline: {
        prose: headline,
        generatedAt: new Date().toISOString()
      },
      articleReads: articleInsights.slice(0, 10),
      competitive: {
        summary: 'Connect Google Search Console for competitive positioning data.',
        queries: []
      },
      recommendations,
      snapshot
    })
  } catch (error) {
    console.error('Performance insights error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

async function buildArticleInsights(
  publishedArticles: typeof articles.$inferSelect[],
  performanceData: typeof performanceSnapshots.$inferSelect[]
): Promise<ArticleInsight[]> {
  const performanceByArticle = new Map<string, typeof performanceSnapshots.$inferSelect[]>()

  for (const perf of performanceData) {
    if (!perf.articleId) continue
    const existing = performanceByArticle.get(perf.articleId) || []
    existing.push(perf)
    performanceByArticle.set(perf.articleId, existing)
  }

  return publishedArticles.map(article => {
    const perfData = performanceByArticle.get(article.id) || []
    const latestPerf = perfData[0]
    const previousPerf = perfData[1]

    // Build trajectory (weekly positions)
    const trajectory = buildTrajectory(perfData)

    // Determine status
    let status: 'climbing' | 'stable' | 'declining' | 'new' = 'new'
    if (perfData.length >= 2) {
      const positionChange = (previousPerf?.position || 100) - (latestPerf?.position || 100)
      if (positionChange > 5) status = 'climbing'
      else if (positionChange < -5) status = 'declining'
      else status = 'stable'
    }

    return {
      articleId: article.id,
      title: article.title,
      slug: article.slug,
      publishedAt: article.publishedAt?.toISOString() || article.createdAt.toISOString(),
      targetQuery: article.targetKeyword || undefined,
      trajectory,
      generatedRead: generateArticleRead(article, latestPerf, status),
      status,
      position: latestPerf?.position || 0,
      previousPosition: previousPerf?.position || 0,
      clicks: latestPerf?.clicks || 0,
      impressions: latestPerf?.impressions || 0
    }
  })
}

function buildTrajectory(perfData: typeof performanceSnapshots.$inferSelect[]): Array<{ week: number; position: number }> {
  // Group by week and get average position
  const weeklyData = new Map<number, number[]>()

  for (const perf of perfData) {
    const weekNum = Math.floor((Date.now() - perf.date.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const existing = weeklyData.get(weekNum) || []
    existing.push(perf.position || 100)
    weeklyData.set(weekNum, existing)
  }

  return Array.from(weeklyData.entries())
    .map(([week, positions]) => ({
      week,
      position: Math.round(positions.reduce((a, b) => a + b, 0) / positions.length)
    }))
    .sort((a, b) => b.week - a.week)
    .slice(0, 8)
}

function generateArticleRead(
  article: typeof articles.$inferSelect,
  perf: typeof performanceSnapshots.$inferSelect | undefined,
  status: string
): string {
  if (!perf) {
    return `"${article.title}" was recently published and is awaiting performance data.`
  }

  const position = perf.position || 0
  const clicks = perf.clicks || 0

  if (status === 'climbing') {
    return `"${article.title}" is gaining momentum, now ranking at position ${position} with ${clicks} clicks. Continue building internal links to support its climb.`
  } else if (status === 'declining') {
    return `"${article.title}" has dropped in rankings to position ${position}. Consider refreshing the content or strengthening its backlink profile.`
  } else if (position <= 10) {
    return `"${article.title}" maintains a strong page-one position at #${position}, generating ${clicks} clicks.`
  }

  return `"${article.title}" ranks at position ${position} with ${clicks} clicks. Target position improvement through content optimization.`
}

function calculateSnapshot(insights: ArticleInsight[], timeWindow: string): PerformanceSnapshot {
  const totalArticles = insights.length
  const pageOneArticles = insights.filter(a => a.position > 0 && a.position <= 10)
  const climbingArticles = insights.filter(a => a.status === 'climbing')

  const qualityScores = insights
    .map(a => a.position > 0 ? Math.max(0, 100 - a.position * 2) : 0)
    .filter(s => s > 0)

  return {
    totalArticles,
    pageOneCount: pageOneArticles.length,
    pageOnePercent: totalArticles > 0 ? Math.round((pageOneArticles.length / totalArticles) * 100) : 0,
    climbingCount: climbingArticles.length,
    climbingEta: climbingArticles.length > 0 ? '2-4 weeks' : undefined,
    voiceMatchAvg: qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
      : 0,
    voiceMatchRange: {
      min: qualityScores.length > 0 ? Math.min(...qualityScores) : 0,
      max: qualityScores.length > 0 ? Math.max(...qualityScores) : 0
    },
    timeWindow: timeWindow as '7d' | '28d' | '90d' | 'all'
  }
}

async function generateHeadlineInsight(snapshot: PerformanceSnapshot, insights: ArticleInsight[]): Promise<string> {
  if (insights.length === 0) {
    return 'No published articles yet. Generate and publish content to start tracking performance.'
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Write a brief 2-3 sentence performance summary for a content marketing dashboard. Be specific and actionable.

Stats:
- ${snapshot.totalArticles} total articles
- ${snapshot.pageOneCount} on page one (${snapshot.pageOnePercent}%)
- ${snapshot.climbingCount} articles climbing in rankings
- ${insights.filter(a => a.status === 'declining').length} declining

Top performer: "${insights[0]?.title || 'N/A'}" at position ${insights[0]?.position || 'N/A'}

Write in second person ("Your content..."), focusing on actionable insights.`
      }]
    })

    const textBlock = response.content.find(b => b.type === 'text')
    return textBlock?.text || generateFallbackHeadline(snapshot)
  } catch {
    return generateFallbackHeadline(snapshot)
  }
}

function generateFallbackHeadline(snapshot: PerformanceSnapshot): string {
  if (snapshot.pageOnePercent >= 50) {
    return `Strong performance with ${snapshot.pageOnePercent}% of your content on page one. ${snapshot.climbingCount} articles are actively climbing in rankings.`
  } else if (snapshot.climbingCount > 0) {
    return `${snapshot.climbingCount} articles showing upward momentum. Focus on supporting these climbers with internal links and fresh content.`
  }
  return `${snapshot.totalArticles} articles tracked. Build momentum by publishing consistently and optimizing existing content.`
}

function generateRecommendations(insights: ArticleInsight[], snapshot: PerformanceSnapshot): Recommendation[] {
  const recommendations: Recommendation[] = []

  // Declining articles need attention
  const declining = insights.filter(a => a.status === 'declining').slice(0, 2)
  for (const article of declining) {
    recommendations.push({
      priority: 'high',
      action: `Refresh "${article.title}"`,
      reason: `This article has dropped from position ${article.previousPosition} to ${article.position}`,
      articleId: article.articleId,
      articleTitle: article.title,
      affordance: 'Refresh Content'
    })
  }

  // Climbing articles could use support
  const climbing = insights.filter(a => a.status === 'climbing').slice(0, 2)
  for (const article of climbing) {
    recommendations.push({
      priority: 'medium',
      action: `Add internal links to "${article.title}"`,
      reason: `Support its climb from position ${article.previousPosition} to ${article.position}`,
      articleId: article.articleId,
      articleTitle: article.title,
      affordance: 'Add Links'
    })
  }

  // General recommendations
  if (snapshot.pageOnePercent < 30) {
    recommendations.push({
      priority: 'medium',
      action: 'Focus on long-tail keywords',
      reason: 'Only ' + snapshot.pageOnePercent + '% of content is on page one. Target less competitive queries.',
      affordance: 'View Topics'
    })
  }

  return recommendations.slice(0, 5)
}
