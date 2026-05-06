import { db, articles, agentChannels, agentConversations } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { parseAgentIntent } from '@/lib/ai/claude'
import { getChannelAdapter } from './adapters'
import { cmsPublishQueue } from '@/lib/queue/queues'
import type { IncomingMessage, ChannelConfig } from './types'

export class AgentRuntime {
  async handleIncomingMessage(
    tenantId: string,
    channelId: string,
    message: IncomingMessage
  ): Promise<void> {
    // Get channel
    const channel = await db.query.agentChannels.findFirst({
      where: and(
        eq(agentChannels.id, channelId),
        eq(agentChannels.tenantId, tenantId)
      )
    })

    if (!channel || !channel.config) {
      console.error(`Channel ${channelId} not found or has no config`)
      return
    }

    const adapter = getChannelAdapter(channel.channelType)

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(
      tenantId,
      channelId,
      message.channelUserId
    )

    // Check if this is a callback/button action
    const isAction = message.messageText.includes(':')
    let intent

    if (isAction) {
      // Parse action directly (e.g., "approve:article-id")
      const [action, articleId] = message.messageText.split(':')
      intent = {
        intent: action as 'approve' | 'reject' | 'edit' | 'schedule',
        confidence: 1.0,
        parameters: { articleId }
      }

      // Update conversation with article context
      if (articleId && !conversation.articleId) {
        await db.update(agentConversations)
          .set({ articleId })
          .where(eq(agentConversations.id, conversation.id))
        conversation.articleId = articleId
      }
    } else {
      // Use NLP to parse intent
      intent = await parseAgentIntent(
        message.messageText,
        conversation.messages || []
      )
    }

    // Execute intent
    await this.executeIntent(
      tenantId,
      channel.config as ChannelConfig,
      conversation,
      intent,
      adapter
    )

    // Update conversation
    await this.addMessageToConversation(conversation.id, {
      role: 'user',
      content: message.messageText,
      timestamp: new Date().toISOString()
    })
  }

  private async getOrCreateConversation(
    tenantId: string,
    channelId: string,
    channelUserId: string
  ) {
    // Look for existing active conversation
    let conversation = await db.query.agentConversations.findFirst({
      where: and(
        eq(agentConversations.tenantId, tenantId),
        eq(agentConversations.channelId, channelId),
        eq(agentConversations.channelUserId, channelUserId)
      ),
      orderBy: (convo, { desc }) => [desc(convo.lastActivityAt)]
    })

    if (!conversation) {
      const [newConvo] = await db.insert(agentConversations).values({
        tenantId,
        channelId,
        channelUserId,
        state: 'idle',
        messages: [],
        lastActivityAt: new Date()
      }).returning()
      conversation = newConvo
    }

    return conversation
  }

  private async executeIntent(
    tenantId: string,
    config: ChannelConfig,
    conversation: typeof agentConversations.$inferSelect,
    intent: { intent: string; confidence: number; parameters?: Record<string, string> },
    adapter: ReturnType<typeof getChannelAdapter>
  ): Promise<void> {
    const articleId = intent.parameters?.articleId || conversation.articleId

    try {
      switch (intent.intent) {
        case 'approve':
          if (!articleId) {
            await adapter.sendError(config, 'No article selected. Please select an article first.')
            return
          }
          await this.handleApprove(tenantId, articleId)
          await adapter.sendConfirmation(config, '✅ Article approved and queued for publishing!')
          await this.updateConversationState(conversation.id, 'complete')
          break

        case 'reject':
          if (!articleId) {
            await adapter.sendError(config, 'No article selected. Please select an article first.')
            return
          }
          await this.handleReject(tenantId, articleId)
          await adapter.sendConfirmation(config, '❌ Article rejected and archived.')
          await this.updateConversationState(conversation.id, 'complete')
          break

        case 'edit':
          if (!articleId) {
            await adapter.sendError(config, 'No article selected. Please select an article first.')
            return
          }
          const editInstructions = intent.parameters?.editInstructions
          if (editInstructions) {
            await this.handleEdit(tenantId, articleId, editInstructions)
            await adapter.sendConfirmation(config, '✏️ Article queued for regeneration with your feedback.')
          } else {
            await adapter.sendConfirmation(config, '✏️ Please describe what changes you\'d like to make to the article.')
            await this.updateConversationState(conversation.id, 'awaiting_response')
          }
          break

        case 'schedule':
          if (!articleId) {
            await adapter.sendError(config, 'No article selected. Please select an article first.')
            return
          }
          const scheduledFor = intent.parameters?.scheduledFor
          if (scheduledFor) {
            await this.handleSchedule(tenantId, articleId, scheduledFor)
            await adapter.sendConfirmation(config, `📅 Article scheduled for ${scheduledFor}`)
            await this.updateConversationState(conversation.id, 'complete')
          } else {
            await adapter.sendConfirmation(config, '📅 When would you like to publish? (e.g., "tomorrow at 9am", "next Monday")')
            await this.updateConversationState(conversation.id, 'awaiting_response')
          }
          break

        case 'help':
          await adapter.sendConfirmation(config, this.getHelpMessage())
          break

        default:
          if (intent.confidence < 0.6) {
            await adapter.sendConfirmation(
              config,
              "I didn't understand that. Try:\n• *approve* - Publish the article\n• *reject* - Archive the article\n• *edit [instructions]* - Request changes\n• *schedule [date]* - Schedule for later\n• *help* - Show all commands"
            )
          }
      }
    } catch (error) {
      console.error('Error executing intent:', error)
      await adapter.sendError(config, `Failed to process your request: ${(error as Error).message}`)
    }
  }

  private async handleApprove(tenantId: string, articleId: string): Promise<void> {
    // Update article status
    await db.update(articles)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(and(eq(articles.id, articleId), eq(articles.tenantId, tenantId)))

    // Get default CMS connection and queue for publishing
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, articleId), eq(articles.tenantId, tenantId))
    })

    if (article?.cmsConnectionId) {
      await cmsPublishQueue.add('publish', {
        tenantId,
        articleId,
        connectionId: article.cmsConnectionId
      })
    }
  }

  private async handleReject(tenantId: string, articleId: string): Promise<void> {
    await db.update(articles)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(articles.id, articleId), eq(articles.tenantId, tenantId)))
  }

  private async handleEdit(tenantId: string, articleId: string, instructions: string): Promise<void> {
    // Update article with edit feedback and reset to draft
    await db.update(articles)
      .set({
        status: 'draft',
        qualityGateResult: {
          score: 0,
          action: 'revise',
          checks: [{ name: 'User Feedback', passed: false, score: 0, message: instructions }]
        },
        updatedAt: new Date()
      })
      .where(and(eq(articles.id, articleId), eq(articles.tenantId, tenantId)))

    // TODO: Queue for regeneration with feedback
  }

  private async handleSchedule(tenantId: string, articleId: string, scheduledFor: string): Promise<void> {
    // Parse the scheduled time (simple implementation)
    const scheduledDate = new Date(scheduledFor)

    await db.update(articles)
      .set({
        status: 'scheduled',
        publishedAt: scheduledDate,
        updatedAt: new Date()
      })
      .where(and(eq(articles.id, articleId), eq(articles.tenantId, tenantId)))
  }

  private async updateConversationState(
    conversationId: string,
    state: 'idle' | 'presenting' | 'awaiting_response' | 'processing' | 'complete'
  ): Promise<void> {
    await db.update(agentConversations)
      .set({ state, lastActivityAt: new Date() })
      .where(eq(agentConversations.id, conversationId))
  }

  private async addMessageToConversation(
    conversationId: string,
    message: { role: 'user' | 'assistant'; content: string; timestamp: string }
  ): Promise<void> {
    const conversation = await db.query.agentConversations.findFirst({
      where: eq(agentConversations.id, conversationId)
    })

    const messages = conversation?.messages || []
    messages.push(message)

    // Keep last 20 messages
    const trimmedMessages = messages.slice(-20)

    await db.update(agentConversations)
      .set({
        messages: trimmedMessages,
        lastActivityAt: new Date()
      })
      .where(eq(agentConversations.id, conversationId))
  }

  private getHelpMessage(): string {
    return `🤖 *Verba Content Agent*

Here's what I can do:

*Review Articles*
• ✅ *approve* - Approve and publish the article
• ❌ *reject* - Reject and archive the article
• ✏️ *edit* [instructions] - Request changes
• 📅 *schedule* [date/time] - Schedule for later

*Other Commands*
• *help* - Show this message
• *status* - Check publishing queue

Just respond naturally and I'll understand what you want to do!`
  }
}

export const agentRuntime = new AgentRuntime()
