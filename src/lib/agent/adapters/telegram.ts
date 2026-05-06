import axios from 'axios'
import type { ChannelAdapter, ChannelConfig, ArticlePreview, IncomingMessage } from '../types'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; first_name: string; username?: string }
    chat: { id: number; type: string }
    text: string
    reply_to_message?: { message_id: number }
  }
  callback_query?: {
    id: string
    from: { id: number; first_name: string; username?: string }
    message: { chat: { id: number }; message_id: number }
    data: string
  }
}

export class TelegramAdapter implements ChannelAdapter {
  type = 'telegram' as const
  private baseUrl = 'https://api.telegram.org/bot'

  async sendArticlePreview(config: ChannelConfig, article: ArticlePreview): Promise<void> {
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram requires botToken and chatId')
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${article.id}` },
          { text: '❌ Reject', callback_data: `reject:${article.id}` }
        ],
        [
          { text: '✏️ Edit', callback_data: `edit:${article.id}` },
          { text: '📅 Schedule', callback_data: `schedule:${article.id}` }
        ]
      ]
    }

    const message = `📝 *New Article Ready for Review*

*${escapeMarkdown(article.title)}*

${escapeMarkdown(article.summary.slice(0, 200))}${article.summary.length > 200 ? '...' : ''}

📊 Quality Score: ${article.qualityScore}%
📏 Word Count: ${article.wordCount}
${article.previewUrl ? `🔗 [Preview](${article.previewUrl})` : ''}

What would you like to do?`

    await axios.post(`${this.baseUrl}${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: message,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  }

  async sendConfirmation(config: ChannelConfig, message: string): Promise<void> {
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram requires botToken and chatId')
    }

    await axios.post(`${this.baseUrl}${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: message,
      parse_mode: 'Markdown'
    })
  }

  async sendError(config: ChannelConfig, error: string): Promise<void> {
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram requires botToken and chatId')
    }

    await axios.post(`${this.baseUrl}${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: `❌ Error: ${error}`,
      parse_mode: 'Markdown'
    })
  }

  async parseWebhook(payload: unknown): Promise<IncomingMessage> {
    const update = payload as TelegramUpdate

    if (update.callback_query) {
      return {
        channelUserId: update.callback_query.from.id.toString(),
        messageText: update.callback_query.data,
        messageId: update.callback_query.id,
        metadata: {
          isCallback: true,
          chatId: update.callback_query.message.chat.id
        }
      }
    }

    if (update.message) {
      return {
        channelUserId: update.message.from.id.toString(),
        messageText: update.message.text || '',
        messageId: update.message.message_id.toString(),
        replyToMessageId: update.message.reply_to_message?.message_id.toString(),
        metadata: {
          chatId: update.message.chat.id,
          username: update.message.from.username
        }
      }
    }

    throw new Error('Invalid Telegram update')
  }

  async verifyWebhook(_request: Request): Promise<boolean> {
    // Telegram doesn't use webhook signatures
    // Security is handled by keeping the bot token secret
    return true
  }

  // Helper to answer callback queries (removes loading state from buttons)
  async answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
    await axios.post(`${this.baseUrl}${botToken}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text
    })
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}
