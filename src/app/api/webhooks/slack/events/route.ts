import { NextRequest, NextResponse } from 'next/server'
import { db, agentChannels } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { SlackAdapter } from '@/lib/agent/adapters/slack'
import { agentRuntime } from '@/lib/agent/runtime'

const adapter = new SlackAdapter()

export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature
    const isValid = await adapter.verifyWebhook(req)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = await req.json()

    // Handle Slack URL verification challenge
    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge })
    }

    // Skip bot messages and message_changed events
    if (
      payload.event?.bot_id ||
      payload.event?.subtype === 'message_changed' ||
      payload.event?.subtype === 'bot_message'
    ) {
      return NextResponse.json({ ok: true })
    }

    // Only handle message events
    if (payload.event?.type !== 'message') {
      return NextResponse.json({ ok: true })
    }

    const message = await adapter.parseWebhook(payload)
    const channelId = payload.event?.channel

    // Find the agent channel
    const channel = await db.query.agentChannels.findFirst({
      where: and(
        eq(agentChannels.channelType, 'slack'),
        eq(agentChannels.isActive, true)
      )
    })

    if (!channel) {
      console.log(`No active Slack channel found`)
      return NextResponse.json({ ok: true })
    }

    const config = channel.config as { channelId?: string }
    if (config.channelId !== channelId) {
      return NextResponse.json({ ok: true })
    }

    // Process message
    await agentRuntime.handleIncomingMessage(
      channel.tenantId,
      channel.id,
      message
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Slack events webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
