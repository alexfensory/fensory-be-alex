import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { getUsage } from '@/lib/billing/stripe'

export const GET = requireTenant(async (_req, { tenant }) => {
  const usage = await getUsage(tenant.tenantId)

  return NextResponse.json(usage)
})
