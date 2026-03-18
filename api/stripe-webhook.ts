/**
 * Vercel Edge Function — Stripe Webhook Handler
 *
 * Handles Stripe webhook events for subscription management.
 * For beta: logs events only. Real verification comes with Supabase.
 *
 * STRIPE_PLACEHOLDER: Add STRIPE_WEBHOOK_SECRET to Vercel env vars after approval.
 */

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.text();

    // STRIPE_PLACEHOLDER: Verify webhook signature after Stripe approval
    // const sig = req.headers.get('stripe-signature');
    // const event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);

    // For beta: parse the event without signature verification
    const event = JSON.parse(body) as { type: string; data: { object: Record<string, unknown> } };

    switch (event.type) {
      case 'checkout.session.completed': {
        // Customer completed checkout — activate Pro
        const session = event.data.object;
        console.log('[stripe-webhook] checkout.session.completed:', session.id);
        // Post-beta: Update user record in Supabase
        break;
      }

      case 'customer.subscription.deleted': {
        // Subscription cancelled — deactivate Pro
        const subscription = event.data.object;
        console.log('[stripe-webhook] customer.subscription.deleted:', subscription.id);
        // Post-beta: Update user record in Supabase
        break;
      }

      case 'customer.subscription.updated': {
        // Subscription updated (e.g., renewal, plan change)
        const subscription = event.data.object;
        console.log('[stripe-webhook] customer.subscription.updated:', subscription.id);
        // Post-beta: Update expiry in Supabase
        break;
      }

      case 'invoice.payment_failed': {
        // Payment failed — may need to notify user
        const invoice = event.data.object;
        console.log('[stripe-webhook] invoice.payment_failed:', invoice.id);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-webhook] Error processing webhook:', err);
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
