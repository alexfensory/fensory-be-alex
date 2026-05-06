import Stripe from 'stripe'
import { db, tenants } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { STRIPE_PRICE_IDS, getPlanTierFromPrice, type PlanTier } from './plans'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia'
})

export async function createCustomer(
  tenantId: string,
  email: string,
  name?: string
): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { tenantId }
  })

  // Update tenant with Stripe customer ID
  await db.update(tenants)
    .set({ stripeCustomerId: customer.id })
    .where(eq(tenants.id, tenantId))

  return customer.id
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { customerId }
    }
  })

  return session.url!
}

export async function createSubscription(
  customerId: string,
  priceId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent']
  })
}

export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<Stripe.Subscription> {
  if (immediately) {
    return stripe.subscriptions.cancel(subscriptionId)
  }

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true
  })
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  return stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newPriceId
    }],
    proration_behavior: 'create_prorations'
  })
}

export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  })
  return session.url
}

export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId)
  } catch {
    return null
  }
}

export interface UsageStats {
  postsUsed: number
  postsLimit: number
  postsRemaining: number
  billingCycleStart: Date | null
  billingCycleEnd: Date | null
  percentUsed: number
}

export async function getUsage(tenantId: string): Promise<UsageStats> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId)
  })

  if (!tenant) {
    throw new Error('Tenant not found')
  }

  const { PLAN_LIMITS } = await import('./plans')
  const planLimits = PLAN_LIMITS[tenant.planTier as PlanTier]

  const postsUsed = tenant.postsUsedThisMonth || 0
  const postsLimit = planLimits.postsPerMonth
  const postsRemaining = Math.max(0, postsLimit - postsUsed)

  let billingCycleEnd: Date | null = null
  if (tenant.billingCycleStart) {
    billingCycleEnd = new Date(tenant.billingCycleStart)
    billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1)
  }

  return {
    postsUsed,
    postsLimit,
    postsRemaining,
    billingCycleStart: tenant.billingCycleStart,
    billingCycleEnd,
    percentUsed: Math.round((postsUsed / postsLimit) * 100)
  }
}

export async function checkUsageLimit(tenantId: string): Promise<boolean> {
  const usage = await getUsage(tenantId)
  return usage.postsRemaining > 0
}

export async function incrementUsage(tenantId: string): Promise<void> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId)
  })

  if (!tenant) {
    throw new Error('Tenant not found')
  }

  await db.update(tenants)
    .set({
      postsUsedThisMonth: (tenant.postsUsedThisMonth || 0) + 1
    })
    .where(eq(tenants.id, tenantId))
}

export async function resetMonthlyUsage(): Promise<void> {
  await db.update(tenants)
    .set({
      postsUsedThisMonth: 0,
      billingCycleStart: new Date()
    })
}

// Webhook handler helpers
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = subscription.customer as string
  const priceId = subscription.items.data[0].price.id
  const planTier = getPlanTierFromPrice(priceId)

  await db.update(tenants)
    .set({
      stripeSubscriptionId: subscription.id,
      planTier,
      billingCycleStart: new Date(subscription.current_period_start * 1000),
      postsUsedThisMonth: 0
    })
    .where(eq(tenants.stripeCustomerId, customerId))
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = subscription.customer as string
  const priceId = subscription.items.data[0].price.id
  const planTier = getPlanTierFromPrice(priceId)

  await db.update(tenants)
    .set({
      planTier,
      billingCycleStart: new Date(subscription.current_period_start * 1000)
    })
    .where(eq(tenants.stripeCustomerId, customerId))
}

export async function handleSubscriptionCanceled(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = subscription.customer as string

  // Downgrade to solo plan
  await db.update(tenants)
    .set({
      planTier: 'solo',
      stripeSubscriptionId: null
    })
    .where(eq(tenants.stripeCustomerId, customerId))
}

export { stripe }
