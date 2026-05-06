import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { createPortalSession, createCustomer } from '@/lib/billing/stripe'
import { db, tenants } from '@/lib/db'
import { eq } from 'drizzle-orm'

export const POST = requireTenant(async (req, { tenant }) => {
  const body = await req.json()
  const { returnUrl } = body

  if (!returnUrl) {
    return NextResponse.json({ error: 'returnUrl is required' }, { status: 400 })
  }

  // Get tenant's Stripe customer ID
  const tenantRecord = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenant.tenantId)
  })

  if (!tenantRecord) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  let customerId = tenantRecord.stripeCustomerId

  // Create customer if doesn't exist
  if (!customerId) {
    // Get user email from the request context
    const { getCurrentUser } = await import('@/lib/auth/clerk')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    customerId = await createCustomer(
      tenant.tenantId,
      user.email,
      user.name || undefined
    )
  }

  const portalUrl = await createPortalSession(customerId, returnUrl)

  return NextResponse.json({ url: portalUrl })
})
