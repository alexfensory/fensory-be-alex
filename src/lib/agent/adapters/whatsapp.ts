import type { ChannelAdapter, ChannelConfig, ArticlePreview, IncomingMessage } from '../types'
import crypto from 'crypto'

interface WhatsAppMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: string
  [key: string]: unknown
}

export class WhatsAppAdapter implements ChannelAdapter {
  type = 'whatsapp' as const
  private baseUrl = 'https://graph.facebook.com/v18.0'

  private get accessToken(): string {
    const token = process.env.WHATSAPP_ACCESS_TOKEN
    if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not configured')
    return token
  }

  private get phoneNumberId(): string {
    const id = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (!id) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured')
    return id
  }

  private get appSecret(): string | undefined {
    return process.env.WHATSAPP_APP_SECRET
  }

  async sendArticlePreview(config: ChannelConfig, article: ArticlePreview): Promise<void> {
    const recipientPhone = config.chatId
    if (!recipientPhone) {
      throw new Error('Recipient phone number (chatId) not configured')
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const qualityEmoji = article.qualityScore >= 80 ? '🟢' : article.qualityScore >= 60 ? '🟡' : '🔴'

    // Send interactive message with buttons
    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: '📝 Article Ready for Review'
        },
        body: {
          text: `*${article.title}*\n\n${article.summary}\n\n📊 Word Count: ${article.wordCount.toLocaleString()}\n${qualityEmoji} Quality Score: ${article.qualityScore}/100${article.previewUrl ? `\n\n🔗 Preview: ${article.previewUrl}` : ''}`
        },
        footer: {
          text: 'Reply with feedback or use buttons below'
        },
        action: {
          buttons: this.buildActionButtons(article)
        }
      }
    }

    await this.sendMessage(message)

    // If there are more than 3 actions, send additional actions as a list
    if (article.actions.length > 3) {
      const listMessage: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: 'More actions:'
          },
          action: {
            button: 'View Actions',
            sections: [
              {
                title: 'Article Actions',
                rows: article.actions.slice(3).map(action => ({
                  id: `action_${article.id}_${action}`,
                  title: action.charAt(0).toUpperCase() + action.slice(1),
                  description: this.getActionDescription(action)
                }))
              }
            ]
          }
        }
      }

      await this.sendMessage(listMessage)
    }
  }

  async sendConfirmation(config: ChannelConfig, message: string): Promise<void> {
    const recipientPhone = config.chatId
    if (!recipientPhone) {
      throw new Error('Recipient phone number (chatId) not configured')
    }

    const whatsappMessage: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'text',
      text: {
        body: `✅ *Confirmed*\n\n${message}`
      }
    }

    await this.sendMessage(whatsappMessage)
  }

  async sendError(config: ChannelConfig, error: string): Promise<void> {
    const recipientPhone = config.chatId
    if (!recipientPhone) {
      throw new Error('Recipient phone number (chatId) not configured')
    }

    const whatsappMessage: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'text',
      text: {
        body: `❌ *Error*\n\n${error}`
      }
    }

    await this.sendMessage(whatsappMessage)
  }

  async parseWebhook(payload: unknown): Promise<IncomingMessage> {
    const data = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id: string
              from: string
              timestamp: string
              type: string
              text?: { body: string }
              interactive?: {
                type: string
                button_reply?: { id: string; title: string }
                list_reply?: { id: string; title: string }
              }
              context?: { message_id: string }
            }>
          }
        }>
      }>
    }

    const entry = data.entry?.[0]
    const change = entry?.changes?.[0]
    const message = change?.value?.messages?.[0]

    if (!message) {
      throw new Error('No message found in webhook payload')
    }

    let messageText = ''

    if (message.type === 'text' && message.text) {
      messageText = message.text.body
    } else if (message.type === 'interactive' && message.interactive) {
      if (message.interactive.button_reply) {
        messageText = message.interactive.button_reply.id
      } else if (message.interactive.list_reply) {
        messageText = message.interactive.list_reply.id
      }
    }

    return {
      channelUserId: message.from,
      messageText,
      messageId: message.id,
      replyToMessageId: message.context?.message_id,
      metadata: {
        timestamp: message.timestamp,
        type: message.type
      }
    }
  }

  async verifyWebhook(request: Request): Promise<boolean> {
    // Handle webhook verification (GET request)
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

      return mode === 'subscribe' && token === verifyToken
    }

    // Handle message webhooks (POST request)
    if (!this.appSecret) {
      return process.env.NODE_ENV === 'development'
    }

    const signature = request.headers.get('x-hub-signature-256')
    if (!signature) return false

    try {
      const body = await request.text()
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', this.appSecret)
        .update(body)
        .digest('hex')

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    } catch {
      return false
    }
  }

  private async sendMessage(message: WhatsAppMessage): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to send WhatsApp message: ${error}`)
    }
  }

  private buildActionButtons(article: ArticlePreview): Array<{
    type: 'reply'
    reply: { id: string; title: string }
  }> {
    // WhatsApp only supports up to 3 buttons
    return article.actions.slice(0, 3).map(action => ({
      type: 'reply' as const,
      reply: {
        id: `action_${article.id}_${action}`,
        title: this.getButtonTitle(action)
      }
    }))
  }

  private getButtonTitle(action: string): string {
    const titles: Record<string, string> = {
      approve: '✅ Approve',
      reject: '❌ Reject',
      edit: '✏️ Edit',
      schedule: '📅 Schedule'
    }
    return titles[action] || action.charAt(0).toUpperCase() + action.slice(1)
  }

  private getActionDescription(action: string): string {
    const descriptions: Record<string, string> = {
      approve: 'Approve and publish the article',
      reject: 'Reject and discard the article',
      edit: 'Request changes to the article',
      schedule: 'Schedule for later publishing'
    }
    return descriptions[action] || `Perform ${action} action`
  }
}
