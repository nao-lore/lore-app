import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

// STRIPE_PLACEHOLDER: replace with real publishable key after Stripe approval
const STRIPE_PUBLISHABLE_KEY = 'pk_test_PLACEHOLDER';

// STRIPE_PLACEHOLDER: replace with real price ID after Stripe approval
const STRIPE_PRICE_ID_MONTHLY = 'price_PLACEHOLDER_monthly';

let stripePromise: Promise<Stripe | null> | null = null;

/** Lazily load Stripe.js — only fetches on first call */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * Redirect the user to Stripe Checkout for a Pro subscription.
 * @param email — optional customer email to pre-fill the checkout form
 */
export async function redirectToCheckout(email?: string): Promise<void> {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe failed to load');

  const { error } = await stripe.redirectToCheckout({
    lineItems: [{ price: STRIPE_PRICE_ID_MONTHLY, quantity: 1 }],
    mode: 'subscription',
    successUrl: `${window.location.origin}?checkout=success`,
    cancelUrl: `${window.location.origin}?checkout=cancelled`,
    ...(email ? { customerEmail: email } : {}),
  });

  if (error) throw error;
}

// STRIPE_PLACEHOLDER: replace after approval
export const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/PLACEHOLDER';

export { STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_ID_MONTHLY };
