import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/clerk'
import { db, tenants, users } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext()

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get full tenant details
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, context.tenantId)
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Get user details
    const user = await db.query.users.findFirst({
      where: eq(users.id, context.userId)
    })

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        planTier: tenant.planTier,
        monthlyPostLimit: getPostLimit(tenant.planTier),
        postsUsedThisMonth: tenant.postsUsedThisMonth,
        websiteUrl: tenant.websiteUrl,
        logoUrl: tenant.logoUrl,
        settings: tenant.settings || {}
      },
      user: user ? {
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name
      } : null
    })
  } catch (error) {
    console.error('Get tenant error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

function getPostLimit(planTier: string): number {
  const limits: Record<string, number> = {
    solo: 10,
    growth: 50,
    scale: 200
  }
  return limits[planTier] || 10
}
