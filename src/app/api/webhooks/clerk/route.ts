import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { db, users, tenants } from '@/lib/db'
import { eq } from 'drizzle-orm'

type WebhookEvent = {
  type: string
  data: Record<string, unknown>
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('Missing CLERK_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 })
  }

  const eventType = evt.type

  try {
    switch (eventType) {
      case 'user.created':
        await handleUserCreated(evt.data)
        break
      case 'user.updated':
        await handleUserUpdated(evt.data)
        break
      case 'user.deleted':
        await handleUserDeleted(evt.data)
        break
      case 'organization.created':
        await handleOrgCreated(evt.data)
        break
      case 'organization.updated':
        await handleOrgUpdated(evt.data)
        break
      case 'organizationMembership.created':
        await handleMembershipCreated(evt.data)
        break
      case 'organizationMembership.deleted':
        await handleMembershipDeleted(evt.data)
        break
      default:
        console.log(`Unhandled webhook event type: ${eventType}`)
    }
  } catch (error) {
    console.error(`Error handling webhook ${eventType}:`, error)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleUserCreated(data: Record<string, unknown>) {
  const clerkUserId = data.id as string
  const email = (data.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address
  const firstName = data.first_name as string | null
  const lastName = data.last_name as string | null

  if (!email) {
    console.error('User created without email:', clerkUserId)
    return
  }

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  })

  if (existingUser) {
    return
  }

  // For solo users without an org, create a personal tenant
  const slug = generateSlug(email)

  const [tenant] = await db.insert(tenants).values({
    slug,
    name: firstName ? `${firstName}'s Workspace` : 'My Workspace',
    planTier: 'solo'
  }).returning()

  await db.insert(users).values({
    clerkUserId,
    tenantId: tenant.id,
    email,
    name: [firstName, lastName].filter(Boolean).join(' ') || null,
    role: 'owner'
  })

  console.log(`Created user ${clerkUserId} with personal tenant ${tenant.id}`)
}

async function handleUserUpdated(data: Record<string, unknown>) {
  const clerkUserId = data.id as string
  const firstName = data.first_name as string | null
  const lastName = data.last_name as string | null

  await db.update(users)
    .set({
      name: [firstName, lastName].filter(Boolean).join(' ') || null
    })
    .where(eq(users.clerkUserId, clerkUserId))
}

async function handleUserDeleted(data: Record<string, unknown>) {
  const clerkUserId = data.id as string

  // Get user to check if they own a tenant
  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
    with: { tenant: true }
  })

  if (user) {
    // Delete user (tenant will cascade if this was the only user)
    await db.delete(users).where(eq(users.clerkUserId, clerkUserId))
    console.log(`Deleted user ${clerkUserId}`)
  }
}

async function handleOrgCreated(data: Record<string, unknown>) {
  const clerkOrgId = data.id as string
  const name = data.name as string
  const slug = data.slug as string

  // Check if tenant already exists
  const existingTenant = await db.query.tenants.findFirst({
    where: eq(tenants.clerkOrgId, clerkOrgId)
  })

  if (existingTenant) {
    return
  }

  await db.insert(tenants).values({
    clerkOrgId,
    slug,
    name,
    planTier: 'solo'
  })

  console.log(`Created tenant for org ${clerkOrgId}`)
}

async function handleOrgUpdated(data: Record<string, unknown>) {
  const clerkOrgId = data.id as string
  const name = data.name as string
  const slug = data.slug as string

  await db.update(tenants)
    .set({ name, slug })
    .where(eq(tenants.clerkOrgId, clerkOrgId))
}

async function handleMembershipCreated(data: Record<string, unknown>) {
  const organization = data.organization as { id: string }
  const publicUserData = data.public_user_data as {
    user_id: string
    identifier: string
    first_name?: string
    last_name?: string
  }
  const role = data.role as string

  // Find the tenant
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.clerkOrgId, organization.id)
  })

  if (!tenant) {
    console.error(`Tenant not found for org ${organization.id}`)
    return
  }

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, publicUserData.user_id)
  })

  if (existingUser) {
    // Update their tenant association
    await db.update(users)
      .set({
        tenantId: tenant.id,
        role: mapClerkRole(role)
      })
      .where(eq(users.clerkUserId, publicUserData.user_id))
  } else {
    // Create the user
    await db.insert(users).values({
      clerkUserId: publicUserData.user_id,
      tenantId: tenant.id,
      email: publicUserData.identifier,
      name: [publicUserData.first_name, publicUserData.last_name].filter(Boolean).join(' ') || null,
      role: mapClerkRole(role)
    })
  }
}

async function handleMembershipDeleted(data: Record<string, unknown>) {
  const publicUserData = data.public_user_data as { user_id: string }

  // Remove user from tenant (set tenantId to null)
  await db.update(users)
    .set({ tenantId: null })
    .where(eq(users.clerkUserId, publicUserData.user_id))
}

function mapClerkRole(clerkRole: string): 'owner' | 'admin' | 'editor' | 'viewer' {
  switch (clerkRole) {
    case 'org:admin':
      return 'admin'
    case 'org:member':
      return 'editor'
    default:
      return 'viewer'
  }
}

function generateSlug(email: string): string {
  const base = email.split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)

  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base}-${suffix}`
}
