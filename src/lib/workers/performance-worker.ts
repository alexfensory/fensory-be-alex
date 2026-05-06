import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/lib/queue/connection'
import { type PerformanceJobData } from '@/lib/queue/queues'
import { db, performanceSnapshots, articles } from '@/lib/db'
import { eq, and, isNotNull } from 'drizzle-orm'
import { getSearchPerformance } from '@/lib/integrations/gsc'

export const performanceWorker = new Worker<PerformanceJobData>(
  'performance',
  async (job: Job<PerformanceJobData>) => {
    const { tenantId, siteUrl } = job.data

    console.log(`[Performance Worker] Syncing performance data for ${siteUrl}`)

    // Get date range (last 28 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 28)

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    await job.updateProgress(20)

    // Fetch performance data from GSC
    const performanceData = await getSearchPerformance(siteUrl, startDateStr, endDateStr)

    await job.updateProgress(50)

    // Get published articles for this tenant
    const publishedArticles = await db.query.articles.findMany({
      where: and(
        eq(articles.tenantId, tenantId),
        eq(articles.status, 'published'),
        isNotNull(articles.publishedUrl)
      ),
      columns: {
        id: true,
        publishedUrl: true
      }
    })

    // Create URL to article ID mapping
    const urlToArticle = new Map<string, string>()
    for (const article of publishedArticles) {
      if (article.publishedUrl) {
        urlToArticle.set(article.publishedUrl, article.id)
        // Also try without trailing slash
        urlToArticle.set(article.publishedUrl.replace(/\/$/, ''), article.id)
      }
    }

    await job.updateProgress(60)

    // Group performance data by page URL
    const pageData = new Map<string, {
      clicks: number
      impressions: number
      ctr: number
      position: number
      queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>
    }>()

    for (const row of performanceData) {
      const page = row.page
      if (!pageData.has(page)) {
        pageData.set(page, {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
          queries: []
        })
      }

      const data = pageData.get(page)!
      data.clicks += row.clicks
      data.impressions += row.impressions
      data.queries.push({
        query: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position
      })
    }

    // Calculate averages for each page
    for (const [, data] of pageData) {
      if (data.impressions > 0) {
        data.ctr = data.clicks / data.impressions
      }
      if (data.queries.length > 0) {
        data.position = data.queries.reduce((sum, q) => sum + q.position, 0) / data.queries.length
      }
    }

    await job.updateProgress(80)

    // Store snapshots
    const today = new Date().toISOString().split('T')[0]
    let savedCount = 0

    for (const [url, data] of pageData) {
      const articleId = urlToArticle.get(url) || urlToArticle.get(url.replace(/\/$/, ''))

      await db.insert(performanceSnapshots).values({
        tenantId,
        articleId: articleId || null,
        url,
        snapshotDate: today,
        clicks: data.clicks,
        impressions: data.impressions,
        ctr: data.ctr,
        position: data.position,
        topQueries: data.queries.slice(0, 10)
      }).onConflictDoNothing()

      savedCount++
    }

    await job.updateProgress(100)

    console.log(`[Performance Worker] Saved ${savedCount} snapshots for tenant ${tenantId}`)

    return {
      pagesProcessed: savedCount,
      dateRange: { start: startDateStr, end: endDateStr }
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 2
  }
)

performanceWorker.on('completed', (job, result) => {
  console.log(`[Performance Worker] Job ${job.id} completed:`, result)
})

performanceWorker.on('failed', (job, err) => {
  console.error(`[Performance Worker] Job ${job?.id} failed:`, err.message)
})

performanceWorker.on('error', (err) => {
  console.error('[Performance Worker] Worker error:', err)
})
