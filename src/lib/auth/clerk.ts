import { auth, currentUser } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { db, users, tenants } from '@/lib/db'
import { PLAN_LIMITS } from '@/lib/billing/plans'
import type { TenantContext, UserWithTenant } from '@/lib/tenant/types'

export async function getCurrentUser(): Promise<UserWithTenant | null> {
  const { userId } = await auth()
  if (!userId) return null

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, userId),
    with: {
      tenant: true
    }
  })

  if (!user) return null

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    role: user.role as 'owner' | 'admin' | 'editor' | 'viewer',
    tenant: user.tenant ? {
      id: user.tenant.id,
      slug: user.tenant.slug,
      name: user.tenant.name,
      planTier: user.tenant.planTier as 'solo' | 'growth' | 'scale',
      postsUsedThisMonth: user.tenant.postsUsedThisMonth || 0
    } : null
  }
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const user = await getCurrentUser()
  if (!user?.tenant) return null

  const planLimits = PLAN_LIMITS[user.tenant.planTier]

  return {
    tenantId: user.tenant.id,
    tenantSlug: user.tenant.slug,
    userId: user.id,
    userRole: user.role,
    planTier: user.tenant.planTier,
    monthlyPostLimit: planLimits.postsPerMonth,
    postsUsedThisMonth: user.tenant.postsUsedThisMonth
  }
}

export async function getClerkUser() {
  return currentUser()
}

export async function requireAuth() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }
  return userId
}

export async function ensureUserExists(clerkUserId: string, email: string, name?: string) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  })

  if (existingUser) {
    return existingUser
  }

  // User doesn't exist yet - they need to be associated with a tenant
  // This happens via the Clerk webhook when organization is created
  return null
}
