/** Stripe Payment Links — no Stripe.js SDK needed */

const STRIPE_PAYMENT_LINK_MONTHLY = 'https://buy.stripe.com/8x2aEZ9abaoa6fucHibMQ03';
// TODO: Update to new $119/year Stripe Payment Link when created
const STRIPE_PAYMENT_LINK_ANNUAL = 'https://buy.stripe.com/00w6oJ7232VIbzO4aMbMQ02';

export const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/5kQcN7fyzeEq33i9v6bMQ00';

/**
 * Redirect the user to Stripe Checkout via Payment Link.
 * @param plan — 'monthly' or 'annual'
 */
export function redirectToCheckout(plan: 'monthly' | 'annual' = 'monthly'): void {
  const url = plan === 'annual' ? STRIPE_PAYMENT_LINK_ANNUAL : STRIPE_PAYMENT_LINK_MONTHLY;
  window.location.href = url;
}
