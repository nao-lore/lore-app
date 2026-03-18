import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51T1OkTQYHC6R0MTf3a7KDACZ2CvvlL8H8h0xxBdIVmXmr67nC4DHow4X5tfVMIDTGq3Aw2qPSXPmgebXnN5V47qZ006hnH5dYC';

const STRIPE_PRICE_ID_MONTHLY = 'price_1TCDzrQYHC6R0MTfaAqrYMvY';

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

export const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/5kQcN7fyzeEq33i9v6bMQ00';

export { STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_ID_MONTHLY };
