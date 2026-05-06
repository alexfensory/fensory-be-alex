export type ChannelType = 'email' | 'telegram' | 'slack' | 'whatsapp' | 'web'

export type AgentAction = 'approve' | 'reject' | 'edit' | 'schedule'

export interface ChannelConfig {
  botToken?: string
  chatId?: string
  channelId?: string
  webhookUrl?: string
  email?: string
  signingSecret?: string
}

export interface ArticlePreview {
  id: string
  title: string
  summary: string
  wordCount: number
  qualityScore: number
  previewUrl?: string
  actions: AgentAction[]
}

export interface IncomingMessage {
  channelUserId: string
  messageText: string
  messageId: string
  replyToMessageId?: string
  metadata?: Record<string, unknown>
}

export interface ChannelAdapter {
  type: ChannelType

  // Sending
  sendArticlePreview(config: ChannelConfig, article: ArticlePreview): Promise<void>
  sendConfirmation(config: ChannelConfig, message: string): Promise<void>
  sendError(config: ChannelConfig, error: string): Promise<void>

  // Webhook parsing
  parseWebhook(payload: unknown): Promise<IncomingMessage>
  verifyWebhook(request: Request): Promise<boolean>
}

export interface ConversationContext {
  id: string
  tenantId: string
  channelId: string
  channelUserId: string
  articleId: string | null
  state: 'idle' | 'presenting' | 'awaiting_response' | 'processing' | 'complete'
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
}
