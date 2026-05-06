import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/lib/queue/connection'
import { type BrandCrawlJobData } from '@/lib/queue/queues'
import { db, brandCorpus, brandVoiceProfiles } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { crawlWebsite } from '@/lib/integrations/firecrawl'
import { generateEmbeddings } from '@/lib/ai/embeddings'
import { analyzeBrandVoice } from '@/lib/ai/claude'

export const crawlWorker = new Worker<BrandCrawlJobData>(
  'brand-crawl',
  async (job: Job<BrandCrawlJobData>) => {
    const { tenantId, url, depth = 3, maxPages = 50 } = job.data

    console.log(`[Crawl Worker] Starting crawl of ${url} for tenant ${tenantId}`)

    // Crawl website
    const pages = await crawlWebsite(url, { depth, maxPages })
    await job.updateProgress(40)

    console.log(`[Crawl Worker] Crawled ${pages.length} pages`)

    // Store corpus entries with embeddings
    let processedCount = 0
    for (const page of pages) {
      try {
        const embedding = await generateEmbeddings(page.content)

        await db.insert(brandCorpus).values({
          tenantId,
          sourceType: 'website',
          sourceUrl: page.url,
          title: page.title,
          content: page.content,
          embedding,
          metadata: {
            wordCount: page.content.split(/\s+/).length,
            contentType: 'webpage'
          },
          crawledAt: new Date()
        })

        processedCount++
        await job.updateProgress(40 + Math.floor((processedCount / pages.length) * 30))
      } catch (error) {
        console.error(`[Crawl Worker] Error processing page ${page.url}:`, error)
      }
    }

    await job.updateProgress(70)

    // Generate voice profile from corpus
    const corpusContent = pages.map(p => p.content)
    const voiceProfile = await analyzeBrandVoice(corpusContent)
    await job.updateProgress(90)

    // Save voice profile (upsert)
    const existingProfile = await db.query.brandVoiceProfiles.findFirst({
      where: eq(brandVoiceProfiles.tenantId, tenantId)
    })

    if (existingProfile) {
      await db.update(brandVoiceProfiles)
        .set({
          toneDescriptors: voiceProfile.toneDescriptors,
          vocabulary: voiceProfile.vocabulary,
          styleGuidelines: voiceProfile.styleGuidelines,
          exampleSnippets: voiceProfile.exampleSnippets,
          doNotUse: voiceProfile.doNotUse,
          targetAudience: voiceProfile.targetAudience,
          industryContext: voiceProfile.industryContext,
          generatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(brandVoiceProfiles.tenantId, tenantId))
    } else {
      await db.insert(brandVoiceProfiles).values({
        tenantId,
        ...voiceProfile,
        generatedAt: new Date()
      })
    }

    await job.updateProgress(100)

    console.log(`[Crawl Worker] Completed crawl for tenant ${tenantId}`)

    return {
      pagesProcessed: processedCount,
      totalPages: pages.length,
      voiceProfileGenerated: true
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 2
  }
)

crawlWorker.on('completed', (job, result) => {
  console.log(`[Crawl Worker] Job ${job.id} completed:`, result)
})

crawlWorker.on('failed', (job, err) => {
  console.error(`[Crawl Worker] Job ${job?.id} failed:`, err.message)
})

crawlWorker.on('error', (err) => {
  console.error('[Crawl Worker] Worker error:', err)
})
