import { NextRequest, NextResponse } from 'next/server'
import { db, agentChannels } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { TelegramAdapter } from '@/lib/agent/adapters/telegram'
import { agentRuntime } from '@/lib/agent/runtime'

const adapter = new TelegramAdapter()

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    // Parse the incoming message
    const message = await adapter.parseWebhook(payload)

    // Get chat ID from the payload
    const chatId = payload.message?.chat?.id || payload.callback_query?.message?.chat?.id
    if (!chatId) {
      return NextResponse.json({ ok: true })
    }

    // Find channel by chat ID
    const channel = await db.query.agentChannels.findFirst({
      where: and(
        eq(agentChannels.channelType, 'telegram'),
        eq(agentChannels.isActive, true)
      )
    })

    if (!channel) {
      console.log(`No active Telegram channel found for chat ${chatId}`)
      return NextResponse.json({ ok: true })
    }

    // Check if this channel's config matches the chat ID
    const config = channel.config as { chatId?: string; botToken?: string }
    if (config.chatId !== chatId.toString()) {
      console.log(`Chat ID ${chatId} doesn't match channel config`)
      return NextResponse.json({ ok: true })
    }

    // Answer callback query if present (removes loading state)
    if (payload.callback_query && config.botToken) {
      await adapter.answerCallbackQuery(config.botToken, payload.callback_query.id)
    }

    // Process message
    await agentRuntime.handleIncomingMessage(
      channel.tenantId,
      channel.id,
      message
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    // Always return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true })
  }
}
