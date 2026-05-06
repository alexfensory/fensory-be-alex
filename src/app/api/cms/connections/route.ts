import { NextRequest, NextResponse } from 'next/server'
import { requireTenant, requireRole } from '@/lib/tenant/isolation'
import { db, cmsConnections } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { getConnector, getSupportedConnectors } from '@/lib/cms/registry'
import { z } from 'zod'

// GET - List CMS connections
export const GET = requireTenant(async (_req, { tenant }) => {
  const connections = await db.query.cmsConnections.findMany({
    where: eq(cmsConnections.tenantId, tenant.tenantId),
    columns: {
      id: true,
      connectorType: true,
      name: true,
      isActive: true,
      isDefault: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true
      // Exclude credentials for security
    }
  })

  return NextResponse.json({
    connections,
    supportedConnectors: getSupportedConnectors()
  })
})

// POST - Create CMS connection
const createSchema = z.object({
  connectorType: z.enum(['wordpress', 'webflow', 'ghost', 'notion', 'hubspot', 'custom']),
  name: z.string().min(1).max(255),
  credentials: z.object({
    siteUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    accessToken: z.string().optional(),
    collectionId: z.string().optional(),
    siteId: z.string().optional()
  }),
  settings: z.object({
    autoPublish: z.boolean().optional(),
    defaultCategory: z.string().optional(),
    defaultAuthor: z.string().optional()
  }).optional(),
  isDefault: z.boolean().default(false)
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

  const { connectorType, name, credentials, settings, isDefault } = result.data

  // Test connection before saving
  try {
    const connector = getConnector(connectorType)
    const isValid = await connector.testConnection(credentials)

    if (!isValid) {
      return NextResponse.json(
        { error: 'Connection test failed. Please check your credentials.' },
        { status: 400 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Connection test failed: ${(error as Error).message}` },
      { status: 400 }
    )
  }

  // If this is default, unset other defaults
  if (isDefault) {
    await db.update(cmsConnections)
      .set({ isDefault: false })
      .where(eq(cmsConnections.tenantId, tenant.tenantId))
  }

  const [connection] = await db.insert(cmsConnections).values({
    tenantId: tenant.tenantId,
    connectorType,
    name,
    credentials,
    settings,
    isActive: true,
    isDefault
  }).returning({
    id: cmsConnections.id,
    connectorType: cmsConnections.connectorType,
    name: cmsConnections.name,
    isActive: cmsConnections.isActive,
    isDefault: cmsConnections.isDefault
  })

  return NextResponse.json({ connection }, { status: 201 })
})

// PATCH - Update CMS connection
const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  settings: z.object({
    autoPublish: z.boolean().optional(),
    defaultCategory: z.string().optional(),
    defaultAuthor: z.string().optional()
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

  const { id, isDefault, ...updates } = result.data

  // If setting as default, unset others
  if (isDefault) {
    await db.update(cmsConnections)
      .set({ isDefault: false })
      .where(eq(cmsConnections.tenantId, tenant.tenantId))
  }

  const [connection] = await db.update(cmsConnections)
    .set({ ...updates, isDefault })
    .where(and(
      eq(cmsConnections.id, id),
      eq(cmsConnections.tenantId, tenant.tenantId)
    ))
    .returning({
      id: cmsConnections.id,
      connectorType: cmsConnections.connectorType,
      name: cmsConnections.name,
      isActive: cmsConnections.isActive,
      isDefault: cmsConnections.isDefault
    })

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  return NextResponse.json({ connection })
})

// DELETE - Delete CMS connection
export const DELETE = requireRole(['owner', 'admin'], async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await db.delete(cmsConnections)
    .where(and(
      eq(cmsConnections.id, id),
      eq(cmsConnections.tenantId, tenant.tenantId)
    ))

  return NextResponse.json({ success: true })
})
