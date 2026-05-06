import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/lib/queue/connection'
import { type AgentDispatchJobData } from '@/lib/queue/queues'
import { db, articles, agentChannels, agentConversations } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { getChannelAdapter } from '@/lib/agent/adapters'
import type { ArticlePreview } from '@/lib/agent/types'

export const agentWorker = new Worker<AgentDispatchJobData>(
  'agent-dispatch',
  async (job: Job<AgentDispatchJobData>) => {
    const { tenantId, articleId, action, channelType } = job.data

    console.log(`[Agent Worker] Dispatching ${action} for article ${articleId}`)

    // Get article
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, articleId), eq(articles.tenantId, tenantId))
    })

    if (!article) {
      throw new Error(`Article ${articleId} not found`)
    }

    // Get active channels for tenant
    const channelsQuery = channelType
      ? and(
          eq(agentChannels.tenantId, tenantId),
          eq(agentChannels.isActive, true),
          eq(agentChannels.channelType, channelType as 'email' | 'telegram' | 'slack' | 'whatsapp' | 'web')
        )
      : and(
          eq(agentChannels.tenantId, tenantId),
          eq(agentChannels.isActive, true)
        )

    const channels = await db.query.agentChannels.findMany({
      where: channelsQuery
    })

    if (channels.length === 0) {
      console.log(`[Agent Worker] No active channels found for tenant ${tenantId}`)
      return { notified: 0 }
    }

    // Create article preview
    const preview: ArticlePreview = {
      id: article.id,
      title: article.title,
      summary: article.metaDescription || article.content?.slice(0, 200) || '',
      wordCount: article.wordCount || 0,
      qualityScore: article.qualityScore || 0,
      actions: ['approve', 'reject', 'edit', 'schedule']
    }

    let notifiedCount = 0

    for (const channel of channels) {
      try {
        const adapter = getChannelAdapter(channel.channelType)

        if (!channel.config) {
          console.warn(`[Agent Worker] Channel ${channel.id} has no config`)
          continue
        }

        await adapter.sendArticlePreview(channel.config, preview)

        // Create or update conversation
        const existingConvo = await db.query.agentConversations.findFirst({
          where: and(
            eq(agentConversations.tenantId, tenantId),
            eq(agentConversations.channelId, channel.id),
            eq(agentConversations.articleId, articleId)
          )
        })

        if (existingConvo) {
          await db.update(agentConversations)
            .set({
              state: 'presenting',
              lastActivityAt: new Date()
            })
            .where(eq(agentConversations.id, existingConvo.id))
        } else {
          await db.insert(agentConversations).values({
            tenantId,
            channelId: channel.id,
            articleId,
            state: 'presenting',
            messages: [],
            lastActivityAt: new Date()
          })
        }

        // Update channel last message time
        await db.update(agentChannels)
          .set({ lastMessageAt: new Date() })
          .where(eq(agentChannels.id, channel.id))

        notifiedCount++
      } catch (error) {
        console.error(`[Agent Worker] Error notifying channel ${channel.id}:`, error)
      }
    }

    console.log(`[Agent Worker] Notified ${notifiedCount} channels`)

    return { notified: notifiedCount }
  },
  {
    connection: createRedisConnection(),
    concurrency: 20
  }
)

agentWorker.on('completed', (job, result) => {
  console.log(`[Agent Worker] Job ${job.id} completed:`, result)
})

agentWorker.on('failed', (job, err) => {
  console.error(`[Agent Worker] Job ${job?.id} failed:`, err.message)
})

agentWorker.on('error', (err) => {
  console.error('[Agent Worker] Worker error:', err)
})
