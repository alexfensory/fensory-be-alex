import { NextRequest, NextResponse } from 'next/server'
import { db, agentChannels } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { WhatsAppAdapter } from '@/lib/agent/adapters/whatsapp'
import { agentRuntime } from '@/lib/agent/runtime'

const whatsappAdapter = new WhatsAppAdapter()

// Webhook verification (GET request from Meta)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WhatsApp webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// Incoming messages (POST request)
export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature
    const isValid = await whatsappAdapter.verifyWebhook(req.clone())
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = await req.json()

    // Check if this is a status update (not a message)
    const entry = payload.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value?.messages || value.messages.length === 0) {
      // This is a status update, acknowledge it
      return NextResponse.json({ ok: true })
    }

    // Parse the incoming message
    const message = await whatsappAdapter.parseWebhook(payload)

    // Find the channel by phone number
    const channels = await db.query.agentChannels.findMany({
      where: eq(agentChannels.channelType, 'whatsapp')
    })

    // Find channel where config.chatId matches the sender phone
    const channel = channels.find(ch => {
      const config = ch.config as Record<string, string> | null
      return config?.chatId === message.channelUserId
    })

    if (!channel) {
      console.log(`No WhatsApp channel found for: ${message.channelUserId}`)
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
    console.error('WhatsApp webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
