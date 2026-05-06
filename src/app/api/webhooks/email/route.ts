import { NextRequest, NextResponse } from 'next/server'
import { db, agentChannels } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { EmailAdapter } from '@/lib/agent/adapters/email'
import { agentRuntime } from '@/lib/agent/runtime'

const emailAdapter = new EmailAdapter()

export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature
    const isValid = await emailAdapter.verifyWebhook(req.clone())
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = await req.json()

    // Parse the incoming message
    const message = await emailAdapter.parseWebhook(payload)

    // Find the channel by email address
    const channels = await db.query.agentChannels.findMany({
      where: eq(agentChannels.channelType, 'email')
    })

    // Find channel where config.email matches the sender
    const channel = channels.find(ch => {
      const config = ch.config as Record<string, string> | null
      return config?.email === message.channelUserId
    })

    if (!channel) {
      console.log(`No email channel found for: ${message.channelUserId}`)
      return NextResponse.json({ ok: true })
    }

    // Handle the incoming message
    await agentRuntime.handleIncomingMessage(
      channel.tenantId,
      channel.id,
      message
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Email webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
