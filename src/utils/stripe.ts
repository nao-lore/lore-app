/** Stripe Payment Links — no Stripe.js SDK needed */

const STRIPE_PAYMENT_LINK_MONTHLY = 'https://buy.stripe.com/8x2aEZ9abaoa6fucHibMQ03';
const STRIPE_PAYMENT_LINK_ANNUAL = 'https://buy.stripe.com/00w6oJ7232VIbzO4aMbMQ02';

/**
 * Pro sales are paused until payment is verified on the server (webhook signature +
 * subscription status). While true: no checkout buttons, and ?checkout=success grants nothing.
 */
export const PRO_SALES_PAUSED = true;

export const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/5kQcN7fyzeEq33i9v6bMQ00';

/**
 * Redirect the user to Stripe Checkout via Payment Link.
 * @param plan — 'monthly' or 'annual'
 */
export function redirectToCheckout(plan: 'monthly' | 'annual' = 'monthly'): void {
  if (PRO_SALES_PAUSED) return;
  const url = plan === 'annual' ? STRIPE_PAYMENT_LINK_ANNUAL : STRIPE_PAYMENT_LINK_MONTHLY;
  window.location.href = url;
}
