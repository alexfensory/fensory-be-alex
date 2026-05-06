import axios from 'axios'
import crypto from 'crypto'
import type { ChannelAdapter, ChannelConfig, ArticlePreview, IncomingMessage } from '../types'

interface SlackEvent {
  type: string
  event?: {
    type: string
    user: string
    text: string
    ts: string
    channel: string
    thread_ts?: string
  }
  challenge?: string
}

interface SlackInteraction {
  type: string
  user: { id: string; username: string }
  actions: Array<{ action_id: string; value?: string }>
  channel: { id: string }
  message: { ts: string }
  response_url: string
}

export class SlackAdapter implements ChannelAdapter {
  type = 'slack' as const

  async sendArticlePreview(config: ChannelConfig, article: ArticlePreview): Promise<void> {
    if (!config.botToken || !config.channelId) {
      throw new Error('Slack requires botToken and channelId')
    }

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📝 New Article Ready for Review', emoji: true }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${article.title}*\n\n${article.summary.slice(0, 300)}${article.summary.length > 300 ? '...' : ''}`
        }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `📊 Quality: *${article.qualityScore}%*` },
          { type: 'mrkdwn', text: `📏 Words: *${article.wordCount}*` }
        ]
      },
      ...(article.previewUrl ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `🔗 <${article.previewUrl}|Preview Article>` }
      }] : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: `approve:${article.id}`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject', emoji: true },
            style: 'danger',
            action_id: `reject:${article.id}`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✏️ Edit', emoji: true },
            action_id: `edit:${article.id}`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📅 Schedule', emoji: true },
            action_id: `schedule:${article.id}`
          }
        ]
      }
    ]

    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: config.channelId,
      blocks,
      text: `New article ready for review: ${article.title}` // Fallback text
    }, {
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json'
      }
    })
  }

  async sendConfirmation(config: ChannelConfig, message: string): Promise<void> {
    if (!config.botToken || !config.channelId) {
      throw new Error('Slack requires botToken and channelId')
    }

    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: config.channelId,
      text: message
    }, {
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json'
      }
    })
  }

  async sendError(config: ChannelConfig, error: string): Promise<void> {
    if (!config.botToken || !config.channelId) {
      throw new Error('Slack requires botToken and channelId')
    }

    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: config.channelId,
      text: `❌ Error: ${error}`
    }, {
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json'
      }
    })
  }

  async parseWebhook(payload: unknown): Promise<IncomingMessage> {
    // Handle interaction payloads (button clicks)
    if (typeof payload === 'object' && payload !== null && 'actions' in payload) {
      const interaction = payload as SlackInteraction
      const action = interaction.actions[0]

      return {
        channelUserId: interaction.user.id,
        messageText: action.action_id,
        messageId: interaction.message.ts,
        metadata: {
          isInteraction: true,
          channelId: interaction.channel.id,
          responseUrl: interaction.response_url
        }
      }
    }

    // Handle event payloads (messages)
    const event = payload as SlackEvent

    if (event.event?.type === 'message') {
      return {
        channelUserId: event.event.user,
        messageText: event.event.text || '',
        messageId: event.event.ts,
        replyToMessageId: event.event.thread_ts,
        metadata: {
          channelId: event.event.channel
        }
      }
    }

    throw new Error('Invalid Slack payload')
  }

  async verifyWebhook(request: Request): Promise<boolean> {
    const signingSecret = process.env.SLACK_SIGNING_SECRET
    if (!signingSecret) {
      console.warn('SLACK_SIGNING_SECRET not set, skipping verification')
      return true
    }

    const signature = request.headers.get('x-slack-signature')
    const timestamp = request.headers.get('x-slack-request-timestamp')

    if (!signature || !timestamp) {
      return false
    }

    // Check timestamp to prevent replay attacks (5 minutes tolerance)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return false
    }

    const body = await request.clone().text()
    const sigBasestring = `v0:${timestamp}:${body}`

    const mySignature = 'v0=' + crypto
      .createHmac('sha256', signingSecret)
      .update(sigBasestring)
      .digest('hex')

    try {
      return crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(signature)
      )
    } catch {
      return false
    }
  }

  // Helper to respond to interactions
  async respondToInteraction(responseUrl: string, message: string): Promise<void> {
    await axios.post(responseUrl, {
      text: message,
      response_type: 'in_channel'
    })
  }
}
