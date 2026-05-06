import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/lib/queue/connection'
import { indexingQueue, type CMSPublishJobData } from '@/lib/queue/queues'
import { db, articles, cmsConnections, indexingChecks, tenants } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { getConnector } from '@/lib/cms/registry'

export const cmsWorker = new Worker<CMSPublishJobData>(
  'cms-publish',
  async (job: Job<CMSPublishJobData>) => {
    const { tenantId, articleId, connectionId } = job.data

    console.log(`[CMS Worker] Publishing article ${articleId} to connection ${connectionId}`)

    // Get connection
    const connection = await db.query.cmsConnections.findFirst({
      where: and(
        eq(cmsConnections.id, connectionId),
        eq(cmsConnections.tenantId, tenantId)
      )
    })

    if (!connection) {
      throw new Error(`CMS connection ${connectionId} not found`)
    }

    if (!connection.isActive) {
      throw new Error(`CMS connection ${connectionId} is not active`)
    }

    await job.updateProgress(20)

    // Get article
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, articleId), eq(articles.tenantId, tenantId))
    })

    if (!article) {
      throw new Error(`Article ${articleId} not found`)
    }

    // Update article status
    await db.update(articles)
      .set({ status: 'publishing' })
      .where(eq(articles.id, articleId))

    await job.updateProgress(30)

    // Get connector and publish
    const connector = getConnector(connection.connectorType)

    try {
      const post = await connector.createPost(
        {
          title: article.title,
          slug: article.slug,
          content: article.content || '',
          contentHtml: article.contentHtml || '',
          metaTitle: article.metaTitle || article.title,
          metaDescription: article.metaDescription || '',
          featuredImageUrl: article.featuredImageUrl || undefined
        },
        connection.credentials!
      )

      await job.updateProgress(80)

      // Update article with CMS info
      await db.update(articles)
        .set({
          status: 'published',
          cmsConnectionId: connectionId,
          cmsPostId: post.id,
          publishedUrl: post.url,
          publishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(articles.id, articleId))

      // Increment posts used this month
      await db.update(tenants)
        .set({
          postsUsedThisMonth: (
            await db.query.tenants.findFirst({
              where: eq(tenants.id, tenantId)
            })
          )?.postsUsedThisMonth! + 1
        })
        .where(eq(tenants.id, tenantId))

      // Queue indexing checks for day 1, 3, 7, 14
      for (const day of [1, 3, 7, 14]) {
        await db.insert(indexingChecks).values({
          tenantId,
          articleId,
          url: post.url,
          checkDay: day,
          status: 'pending'
        })
      }

      // Schedule first indexing check
      await indexingQueue.add(
        'check',
        { tenantId, articleId, url: post.url },
        { delay: 24 * 60 * 60 * 1000 } // 24 hours
      )

      await job.updateProgress(100)

      console.log(`[CMS Worker] Published article ${articleId} to ${post.url}`)

      return {
        postId: post.id,
        url: post.url,
        status: post.status
      }
    } catch (error) {
      // Update article status to error
      await db.update(articles)
        .set({
          status: 'error',
          updatedAt: new Date()
        })
        .where(eq(articles.id, articleId))

      // Update connection with error
      await db.update(cmsConnections)
        .set({ lastError: (error as Error).message })
        .where(eq(cmsConnections.id, connectionId))

      throw error
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 10
  }
)

cmsWorker.on('completed', (job, result) => {
  console.log(`[CMS Worker] Job ${job.id} completed:`, result)
})

cmsWorker.on('failed', (job, err) => {
  console.error(`[CMS Worker] Job ${job?.id} failed:`, err.message)
})

cmsWorker.on('error', (err) => {
  console.error('[CMS Worker] Worker error:', err)
})
