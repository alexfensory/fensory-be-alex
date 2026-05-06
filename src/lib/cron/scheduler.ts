import { db, tenants, indexingChecks, articles } from '@/lib/db'
import { eq, and, isNotNull, lte } from 'drizzle-orm'
import {
  performanceQueue,
  indexingQueue,
  topicDiscoveryQueue
} from '@/lib/queue/queues'
import { resetMonthlyUsage } from '@/lib/billing/stripe'

/**
 * Performance sync job - runs daily at 2 AM
 * Syncs Google Search Console data for all tenants with GSC configured
 */
export async function runPerformanceSync() {
  console.log('[Cron] Running performance sync...')

  // Get tenants with GSC configured (those with published articles)
  const tenantsWithContent = await db
    .selectDistinct({ id: tenants.id })
    .from(tenants)
    .innerJoin(articles, eq(articles.tenantId, tenants.id))
    .where(
      and(
        eq(articles.status, 'published'),
        isNotNull(articles.publishedUrl)
      )
    )

  let queuedCount = 0
  for (const tenant of tenantsWithContent) {
    // Get published articles to determine site URLs
    const publishedArticles = await db.query.articles.findMany({
      where: and(
        eq(articles.tenantId, tenant.id),
        eq(articles.status, 'published'),
        isNotNull(articles.publishedUrl)
      ),
      columns: { publishedUrl: true },
      limit: 1
    })

    if (publishedArticles.length > 0 && publishedArticles[0].publishedUrl) {
      const url = new URL(publishedArticles[0].publishedUrl)
      const siteUrl = `${url.protocol}//${url.host}/`

      await performanceQueue.add('sync', {
        tenantId: tenant.id,
        siteUrl
      })
      queuedCount++
    }
  }

  console.log(`[Cron] Queued performance sync for ${queuedCount} tenants`)
  return { queuedCount }
}

/**
 * Indexing checks job - runs every 6 hours
 * Checks indexing status for recently published articles
 */
export async function runIndexingChecks() {
  console.log('[Cron] Running indexing checks...')

  // Find pending checks that are due
  const now = new Date()
  const pendingChecks = await db.query.indexingChecks.findMany({
    where: eq(indexingChecks.status, 'pending'),
    limit: 100
  })

  let queuedCount = 0
  for (const check of pendingChecks) {
    // Calculate if this check is due based on checkDay
    const article = await db.query.articles.findFirst({
      where: eq(articles.id, check.articleId),
      columns: { publishedAt: true }
    })

    if (!article?.publishedAt) continue

    const publishedDate = new Date(article.publishedAt)
    const daysSincePublish = Math.floor(
      (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Check if this check day has passed
    if (daysSincePublish >= check.checkDay) {
      await indexingQueue.add('check', {
        tenantId: check.tenantId,
        articleId: check.articleId,
        checkId: check.id,
        url: check.url
      })
      queuedCount++
    }
  }

  console.log(`[Cron] Queued ${queuedCount} indexing checks`)
  return { queuedCount }
}

/**
 * Monthly usage reset - runs on 1st of each month
 * Resets the postsUsedThisMonth counter for all tenants
 */
export async function runMonthlyUsageReset() {
  console.log('[Cron] Running monthly usage reset...')

  await resetMonthlyUsage()

  console.log('[Cron] Monthly usage reset complete')
  return { success: true }
}

/**
 * Newsjacking discovery - runs every 4 hours
 * Discovers trending topics for tenants with newsjacking enabled
 */
export async function runNewsjackingDiscovery() {
  console.log('[Cron] Running newsjacking discovery...')

  // Get tenants with newsjacking enabled in settings
  const allTenants = await db.query.tenants.findMany({
    columns: { id: true, settings: true }
  })

  let queuedCount = 0
  for (const tenant of allTenants) {
    const settings = tenant.settings as { newsjackingEnabled?: boolean } | null
    if (settings?.newsjackingEnabled) {
      await topicDiscoveryQueue.add('newsjacking', {
        tenantId: tenant.id,
        mode: 'newsjacking'
      })
      queuedCount++
    }
  }

  console.log(`[Cron] Queued newsjacking discovery for ${queuedCount} tenants`)
  return { queuedCount }
}

/**
 * Scheduled publishing - runs every hour
 * Publishes articles that are scheduled for the current time
 */
export async function runScheduledPublishing() {
  console.log('[Cron] Running scheduled publishing...')

  const now = new Date()

  const scheduledArticles = await db.query.articles.findMany({
    where: and(
      eq(articles.status, 'scheduled'),
      lte(articles.publishedAt, now)
    ),
    with: {
      tenant: true
    }
  })

  let publishedCount = 0
  for (const article of scheduledArticles) {
    // Get default CMS connection
    const { cmsConnections } = await import('@/lib/db')

    const connection = await db.query.cmsConnections.findFirst({
      where: and(
        eq(cmsConnections.tenantId, article.tenantId),
        eq(cmsConnections.isDefault, true),
        eq(cmsConnections.isActive, true)
      )
    })

    if (connection) {
      const { cmsPublishQueue } = await import('@/lib/queue/queues')

      await cmsPublishQueue.add('publish', {
        tenantId: article.tenantId,
        articleId: article.id,
        connectionId: connection.id
      })
      publishedCount++
    }
  }

  console.log(`[Cron] Queued ${publishedCount} scheduled articles for publishing`)
  return { publishedCount }
}
