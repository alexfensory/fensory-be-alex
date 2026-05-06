import { NextRequest, NextResponse } from 'next/server'
import { db, agentChannels } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { SlackAdapter } from '@/lib/agent/adapters/slack'
import { agentRuntime } from '@/lib/agent/runtime'

const adapter = new SlackAdapter()

export async function POST(req: NextRequest) {
  try {
    // Slack sends interactions as form-urlencoded with a 'payload' field
    const formData = await req.formData()
    const payloadString = formData.get('payload') as string

    if (!payloadString) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
    }

    const payload = JSON.parse(payloadString)

    // Parse the interaction
    const message = await adapter.parseWebhook(payload)
    const channelId = payload.channel?.id

    // Find the agent channel
    const channel = await db.query.agentChannels.findFirst({
      where: and(
        eq(agentChannels.channelType, 'slack'),
        eq(agentChannels.isActive, true)
      )
    })

    if (!channel) {
      return NextResponse.json({ ok: true })
    }

    const config = channel.config as { channelId?: string }
    if (config.channelId !== channelId) {
      return NextResponse.json({ ok: true })
    }

    // Process the interaction
    await agentRuntime.handleIncomingMessage(
      channel.tenantId,
      channel.id,
      message
    )

    // Respond to acknowledge the interaction
    if (payload.response_url) {
      await adapter.respondToInteraction(payload.response_url, '⏳ Processing...')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Slack interactions webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
