import { NextRequest, NextResponse } from 'next/server'
import { requireTenant, requireRole } from '@/lib/tenant/isolation'
import { db, agentChannels } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { getSupportedChannels } from '@/lib/agent/adapters'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'

// GET - List agent channels
export const GET = requireTenant(async (_req, { tenant }) => {
  const channels = await db.query.agentChannels.findMany({
    where: eq(agentChannels.tenantId, tenant.tenantId),
    columns: {
      id: true,
      channelType: true,
      isActive: true,
      lastMessageAt: true,
      createdAt: true
      // Exclude config for security
    }
  })

  return NextResponse.json({
    channels,
    supportedChannels: getSupportedChannels()
  })
})

// POST - Create agent channel
const createSchema = z.object({
  channelType: z.enum(['email', 'telegram', 'slack', 'whatsapp', 'web']),
  config: z.object({
    botToken: z.string().optional(),
    chatId: z.string().optional(),
    channelId: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    email: z.string().email().optional()
  }),
  isActive: z.boolean().default(false)
})

export const POST = requireRole(['owner', 'admin'], async (req, { tenant }) => {
  const body = await req.json()

  const result = createSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { channelType, config, isActive } = result.data

  // Generate webhook secret for incoming webhooks
  const webhookSecret = uuid()

  const [channel] = await db.insert(agentChannels).values({
    tenantId: tenant.tenantId,
    channelType,
    config,
    isActive,
    webhookSecret
  }).returning({
    id: agentChannels.id,
    channelType: agentChannels.channelType,
    isActive: agentChannels.isActive,
    webhookSecret: agentChannels.webhookSecret,
    createdAt: agentChannels.createdAt
  })

  // Return webhook URL for external configuration
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const webhookUrl = `${baseUrl}/api/webhooks/${channelType}?secret=${webhookSecret}`

  return NextResponse.json({
    channel,
    webhookUrl,
    message: `Configure your ${channelType} to send webhooks to: ${webhookUrl}`
  }, { status: 201 })
})

// PATCH - Update agent channel
const updateSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
  config: z.object({
    botToken: z.string().optional(),
    chatId: z.string().optional(),
    channelId: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    email: z.string().email().optional()
  }).optional()
})

export const PATCH = requireRole(['owner', 'admin'], async (req, { tenant }) => {
  const body = await req.json()

  const result = updateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { id, ...updates } = result.data

  const [channel] = await db.update(agentChannels)
    .set(updates)
    .where(and(
      eq(agentChannels.id, id),
      eq(agentChannels.tenantId, tenant.tenantId)
    ))
    .returning({
      id: agentChannels.id,
      channelType: agentChannels.channelType,
      isActive: agentChannels.isActive
    })

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  return NextResponse.json({ channel })
})

// DELETE - Delete agent channel
export const DELETE = requireRole(['owner', 'admin'], async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await db.delete(agentChannels)
    .where(and(
      eq(agentChannels.id, id),
      eq(agentChannels.tenantId, tenant.tenantId)
    ))

  return NextResponse.json({ success: true })
})
