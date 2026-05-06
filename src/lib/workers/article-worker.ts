import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/lib/queue/connection'
import { agentDispatchQueue, type ArticleGenerationJobData } from '@/lib/queue/queues'
import { db, articles, topics, articleBriefs } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateArticleContent } from '@/lib/ai/claude'
import { getBrandVoice } from '@/lib/brand/voice'
import { searchSimilarContent } from '@/lib/ai/embeddings'
import { runQualityGates } from '@/lib/quality/gates'
import { generateSlug } from '@/lib/utils/slug'

export const articleWorker = new Worker<ArticleGenerationJobData>(
  'article-generation',
  async (job: Job<ArticleGenerationJobData>) => {
    const { tenantId, topicId, briefId } = job.data

    console.log(`[Article Worker] Starting generation for topic ${topicId}`)

    // Update job progress
    await job.updateProgress(10)

    // Get topic
    const topic = await db.query.topics.findFirst({
      where: and(eq(topics.id, topicId), eq(topics.tenantId, tenantId))
    })

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`)
    }

    // Update topic status
    await db.update(topics)
      .set({ status: 'in_progress' })
      .where(eq(topics.id, topicId))

    // Get brand context
    const brandVoice = await getBrandVoice(tenantId)
    await job.updateProgress(20)

    // Get or generate brief
    let brief
    if (briefId) {
      brief = await db.query.articleBriefs.findFirst({
        where: and(eq(articleBriefs.id, briefId), eq(articleBriefs.tenantId, tenantId))
      })
    }

    if (!brief) {
      // Generate a basic brief from the topic
      brief = {
        title: topic.title,
        targetWordCount: 1500,
        outline: [
          { heading: 'Introduction', level: 1 },
          { heading: 'Main Content', level: 1 },
          { heading: 'Conclusion', level: 1 }
        ],
        brandContext: brandVoice?.targetAudience || ''
      }
    }
    await job.updateProgress(30)

    // Get relevant RAG context
    const relevantContext = await searchSimilarContent(
      tenantId,
      `${topic.title} ${topic.keywords?.join(' ') || ''}`,
      5
    )
    await job.updateProgress(40)

    // Create article record
    const [article] = await db.insert(articles).values({
      tenantId,
      topicId,
      title: brief.title || topic.title,
      slug: generateSlug(brief.title || topic.title),
      status: 'generating'
    }).returning()

    await job.updateProgress(50)

    // Generate article with Claude
    const generatedContent = await generateArticleContent(
      {
        title: brief.title || topic.title,
        targetWordCount: brief.targetWordCount || 1500,
        outline: brief.outline || [],
        seoRecommendations: [],
        brandContext: brief.brandContext || ''
      },
      brandVoice || {
        toneDescriptors: [],
        vocabulary: {},
        styleGuidelines: [],
        exampleSnippets: [],
        doNotUse: [],
        targetAudience: '',
        industryContext: ''
      },
      relevantContext.map(c => c.content)
    )
    await job.updateProgress(70)

    // Run quality gates
    const qualityResult = await runQualityGates(generatedContent, tenantId)
    await job.updateProgress(85)

    // Update article with generated content
    await db.update(articles)
      .set({
        content: generatedContent.content,
        contentHtml: generatedContent.contentHtml,
        metaTitle: generatedContent.metaTitle,
        metaDescription: generatedContent.metaDescription,
        wordCount: generatedContent.wordCount,
        qualityScore: qualityResult.score,
        qualityGateResult: qualityResult,
        status: qualityResult.action === 'publish' ? 'approved' : 'pending_review',
        updatedAt: new Date()
      })
      .where(eq(articles.id, article.id))

    // Update topic status
    await db.update(topics)
      .set({ status: 'completed' })
      .where(eq(topics.id, topicId))

    await job.updateProgress(90)

    // Dispatch agent notification if needs review
    if (qualityResult.action === 'review') {
      await agentDispatchQueue.add('notify', {
        tenantId,
        articleId: article.id,
        action: 'review'
      })
    }

    await job.updateProgress(100)

    console.log(`[Article Worker] Completed generation for article ${article.id}`)

    return {
      articleId: article.id,
      quality: qualityResult,
      wordCount: generatedContent.wordCount
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 3
  }
)

articleWorker.on('completed', (job, result) => {
  console.log(`[Article Worker] Job ${job.id} completed:`, result)
})

articleWorker.on('failed', (job, err) => {
  console.error(`[Article Worker] Job ${job?.id} failed:`, err.message)
})

articleWorker.on('error', (err) => {
  console.error('[Article Worker] Worker error:', err)
})
