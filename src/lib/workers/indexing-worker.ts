import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/lib/queue/connection'
import { type IndexingJobData } from '@/lib/queue/queues'
import { db, indexingChecks, articles } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { checkUrlIndexing } from '@/lib/integrations/gsc'

export const indexingWorker = new Worker<IndexingJobData>(
  'indexing',
  async (job: Job<IndexingJobData>) => {
    const { tenantId, articleId, url, checkId } = job.data

    console.log(`[Indexing Worker] Checking indexing status for ${url}`)

    // Get or create the check record
    let check
    if (checkId) {
      check = await db.query.indexingChecks.findFirst({
        where: and(
          eq(indexingChecks.id, checkId),
          eq(indexingChecks.tenantId, tenantId)
        )
      })
    }

    if (!check) {
      // Find the next pending check for this article
      check = await db.query.indexingChecks.findFirst({
        where: and(
          eq(indexingChecks.articleId, articleId),
          eq(indexingChecks.tenantId, tenantId),
          eq(indexingChecks.status, 'pending')
        ),
        orderBy: (checks, { asc }) => [asc(checks.checkDay)]
      })
    }

    if (!check) {
      console.log(`[Indexing Worker] No pending check found for article ${articleId}`)
      return { status: 'no_check_needed' }
    }

    // Update check status
    await db.update(indexingChecks)
      .set({ status: 'checking' })
      .where(eq(indexingChecks.id, check.id))

    await job.updateProgress(30)

    try {
      // Check indexing status via GSC
      const result = await checkUrlIndexing(url)

      await job.updateProgress(80)

      // Update check with result
      await db.update(indexingChecks)
        .set({
          status: 'complete',
          isIndexed: result.isIndexed,
          checkedAt: new Date(),
          result: {
            isIndexed: result.isIndexed,
            lastCrawled: result.lastCrawled,
            verdict: result.verdict
          }
        })
        .where(eq(indexingChecks.id, check.id))

      await job.updateProgress(100)

      console.log(`[Indexing Worker] URL ${url} indexed: ${result.isIndexed}`)

      return {
        checkId: check.id,
        isIndexed: result.isIndexed,
        checkDay: check.checkDay
      }
    } catch (error) {
      // Mark as failed
      await db.update(indexingChecks)
        .set({
          status: 'failed',
          checkedAt: new Date(),
          result: {
            isIndexed: false,
            issues: [(error as Error).message]
          }
        })
        .where(eq(indexingChecks.id, check.id))

      throw error
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5
  }
)

indexingWorker.on('completed', (job, result) => {
  console.log(`[Indexing Worker] Job ${job.id} completed:`, result)
})

indexingWorker.on('failed', (job, err) => {
  console.error(`[Indexing Worker] Job ${job?.id} failed:`, err.message)
})

indexingWorker.on('error', (err) => {
  console.error('[Indexing Worker] Worker error:', err)
})
