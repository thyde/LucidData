import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { syncSubscription } from '@/lib/services/stripe-billing.service'
import { markDataOrderPaid, markDataOrderCanceled } from '@/lib/services/data-order.service'
import { syncConnectAccount } from '@/lib/services/payout.service'

// Stripe signature verification needs the raw request body and Node APIs.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!isStripeConfigured() || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const payload = await req.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
          await syncSubscription(subscription)
        } else if (session.metadata?.kind === 'data_order') {
          await markDataOrderPaid(session)
        }
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.kind === 'data_order') {
          await markDataOrderCanceled(session)
        }
        break
      }
      case 'account.updated': {
        await syncConnectAccount(event.data.object as Stripe.Account)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break
    }
  } catch (err) {
    console.error('Stripe webhook handler error', event.type, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
