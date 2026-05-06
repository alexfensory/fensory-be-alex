import type { PlanTier } from '@/lib/billing/plans'

export interface TenantContext {
  tenantId: string
  tenantSlug: string
  userId: string
  userRole: 'owner' | 'admin' | 'editor' | 'viewer'
  planTier: PlanTier
  monthlyPostLimit: number
  postsUsedThisMonth: number
}

export interface UserWithTenant {
  id: string
  clerkUserId: string
  email: string
  name: string | null
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  tenant: {
    id: string
    slug: string
    name: string
    planTier: PlanTier
    postsUsedThisMonth: number
  } | null
}
