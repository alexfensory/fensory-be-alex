import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionCanceled
} from '@/lib/billing/stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia'
})

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Stripe webhook verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        // Handle successful payment - could send notification
        console.log('Payment succeeded for invoice:', (event.data.object as Stripe.Invoice).id)
        break

      case 'invoice.payment_failed':
        // Handle failed payment - could send notification
        console.error('Payment failed for invoice:', (event.data.object as Stripe.Invoice).id)
        break

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }
  } catch (error) {
    console.error(`Error handling Stripe webhook ${event.type}:`, error)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
