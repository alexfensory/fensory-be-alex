import type { ChannelAdapter, ChannelConfig, ArticlePreview, IncomingMessage } from '../types'
import crypto from 'crypto'

interface ResendEmailResponse {
  id: string
}

export class EmailAdapter implements ChannelAdapter {
  type = 'email' as const
  private baseUrl = 'https://api.resend.com'

  private get apiKey(): string {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not configured')
    return key
  }

  private get fromEmail(): string {
    return process.env.RESEND_FROM_EMAIL || 'noreply@verba.ai'
  }

  private get webhookSecret(): string | undefined {
    return process.env.RESEND_WEBHOOK_SECRET
  }

  async sendArticlePreview(config: ChannelConfig, article: ArticlePreview): Promise<void> {
    if (!config.email) {
      throw new Error('Email address not configured for channel')
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const actionButtons = article.actions.map(action => {
      const actionUrl = `${appUrl}/api/agent/action?articleId=${article.id}&action=${action}`
      const buttonColor = action === 'approve' ? '#22c55e' : action === 'reject' ? '#ef4444' : '#3b82f6'
      const buttonText = action.charAt(0).toUpperCase() + action.slice(1)

      return `
        <a href="${actionUrl}" style="
          display: inline-block;
          padding: 12px 24px;
          margin: 0 8px 8px 0;
          background-color: ${buttonColor};
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
        ">${buttonText}</a>
      `
    }).join('')

    const qualityColor = article.qualityScore >= 80 ? '#22c55e' : article.qualityScore >= 60 ? '#eab308' : '#ef4444'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">📝 Article Ready for Review</h1>
        </div>

        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="margin-top: 0; color: #111827; font-size: 20px;">${article.title}</h2>

          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 16px 0; color: #4b5563;">${article.summary}</p>

            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 120px;">
                <span style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Word Count</span>
                <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: #111827;">${article.wordCount.toLocaleString()}</p>
              </div>
              <div style="flex: 1; min-width: 120px;">
                <span style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Quality Score</span>
                <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: ${qualityColor};">${article.qualityScore}/100</p>
              </div>
            </div>
          </div>

          ${article.previewUrl ? `
            <p style="margin-bottom: 20px;">
              <a href="${article.previewUrl}" style="color: #6366f1; text-decoration: none; font-weight: 500;">
                👁 View Full Article Preview →
              </a>
            </p>
          ` : ''}

          <div style="margin-top: 24px;">
            ${actionButtons}
          </div>

          <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
            Reply to this email with "approve", "reject", or feedback to take action.
          </p>
        </div>

        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">Sent by Verba AI Content Platform</p>
        </div>
      </body>
      </html>
    `

    await this.sendEmail({
      to: config.email,
      subject: `📝 Review: ${article.title}`,
      html,
      headers: {
        'X-Article-ID': article.id
      }
    })
  }

  async sendConfirmation(config: ChannelConfig, message: string): Promise<void> {
    if (!config.email) {
      throw new Error('Email address not configured for channel')
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #22c55e; padding: 30px; border-radius: 12px;">
          <h1 style="color: white; margin: 0 0 16px 0; font-size: 24px;">✅ Action Confirmed</h1>
          <p style="color: white; margin: 0; font-size: 16px; opacity: 0.9;">${message}</p>
        </div>

        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">Sent by Verba AI Content Platform</p>
        </div>
      </body>
      </html>
    `

    await this.sendEmail({
      to: config.email,
      subject: `✅ ${message}`,
      html
    })
  }

  async sendError(config: ChannelConfig, error: string): Promise<void> {
    if (!config.email) {
      throw new Error('Email address not configured for channel')
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #ef4444; padding: 30px; border-radius: 12px;">
          <h1 style="color: white; margin: 0 0 16px 0; font-size: 24px;">❌ Error</h1>
          <p style="color: white; margin: 0; font-size: 16px; opacity: 0.9;">${error}</p>
        </div>

        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">Sent by Verba AI Content Platform</p>
        </div>
      </body>
      </html>
    `

    await this.sendEmail({
      to: config.email,
      subject: `❌ Error: ${error.substring(0, 50)}`,
      html
    })
  }

  async parseWebhook(payload: unknown): Promise<IncomingMessage> {
    // Resend webhook payload for email replies (inbound emails)
    const data = payload as {
      type: string
      data: {
        email_id: string
        from: string
        to: string
        subject: string
        text?: string
        html?: string
        headers?: Record<string, string>
      }
    }

    if (data.type !== 'email.received') {
      throw new Error('Unsupported webhook event type')
    }

    const emailData = data.data
    const articleId = emailData.headers?.['X-Article-ID'] || ''

    return {
      channelUserId: emailData.from,
      messageText: emailData.text || this.stripHtml(emailData.html || ''),
      messageId: emailData.email_id,
      metadata: {
        subject: emailData.subject,
        articleId
      }
    }
  }

  async verifyWebhook(request: Request): Promise<boolean> {
    if (!this.webhookSecret) {
      // If no webhook secret configured, skip verification in development
      return process.env.NODE_ENV === 'development'
    }

    const signature = request.headers.get('svix-signature')
    const timestamp = request.headers.get('svix-timestamp')
    const svixId = request.headers.get('svix-id')

    if (!signature || !timestamp || !svixId) {
      return false
    }

    try {
      const body = await request.text()
      const signedContent = `${svixId}.${timestamp}.${body}`

      const secretBytes = Buffer.from(this.webhookSecret.split('_')[1], 'base64')
      const expectedSignature = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64')

      // Signature header contains multiple signatures, check if any match
      const signatures = signature.split(' ')
      return signatures.some(sig => {
        const sigValue = sig.split(',')[1]
        return sigValue === expectedSignature
      })
    } catch {
      return false
    }
  }

  private async sendEmail(options: {
    to: string
    subject: string
    html: string
    headers?: Record<string, string>
  }): Promise<ResendEmailResponse> {
    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        headers: options.headers
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to send email: ${error}`)
    }

    return response.json()
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim()
  }
}
