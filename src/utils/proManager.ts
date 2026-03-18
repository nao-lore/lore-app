import { safeGetItem, safeSetItem } from '../storage/core';

// ─── Storage Keys ───

const PRO_ACTIVE_KEY = 'threadlog_pro_active';
const PRO_EXPIRY_KEY = 'threadlog_pro_expiry';
const PRO_SESSION_KEY = 'threadlog_pro_session_id';

// ─── Pro State ───

/** Check if the user has an active Pro subscription. */
export function isPro(): boolean {
  const active = safeGetItem(PRO_ACTIVE_KEY);
  if (active !== 'true') return false;

  // Check expiry if set
  const expiry = safeGetItem(PRO_EXPIRY_KEY);
  if (expiry) {
    const expiryDate = new Date(expiry);
    if (expiryDate.getTime() < Date.now()) {
      // Expired — deactivate Pro
      setPro(false);
      return false;
    }
  }

  return true;
}

/** Set the Pro subscription active state. */
export function setPro(active: boolean): void {
  safeSetItem(PRO_ACTIVE_KEY, active ? 'true' : 'false');
  if (!active) {
    // Clear expiry when deactivating
    safeSetItem(PRO_EXPIRY_KEY, '');
    safeSetItem(PRO_SESSION_KEY, '');
  }
}

/** Get the Pro subscription expiry date as an ISO string, or null if not set. */
export function getProExpiryDate(): string | null {
  const expiry = safeGetItem(PRO_EXPIRY_KEY);
  return expiry || null;
}

/** Set the Pro subscription expiry date. */
export function setProExpiryDate(isoDate: string): void {
  safeSetItem(PRO_EXPIRY_KEY, isoDate);
}

/**
 * Called after a successful Stripe Checkout redirect.
 * For beta: sets Pro active with a 30-day expiry.
 * Post-beta: will verify with Supabase + Stripe webhook.
 */
export function setProFromCheckout(sessionId: string): void {
  safeSetItem(PRO_SESSION_KEY, sessionId);
  setPro(true);

  // Beta: set 30-day expiry from now
  // Post-beta: expiry will come from Stripe webhook data
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  setProExpiryDate(expiry.toISOString());
}

/** Get the Stripe checkout session ID, if any. */
export function getProSessionId(): string | null {
  const id = safeGetItem(PRO_SESSION_KEY);
  return id || null;
}

/** Full Pro status check. */
export function checkProStatus(): { isPro: boolean; expiresAt?: string } {
  const active = isPro();
  if (!active) return { isPro: false };

  const expiry = getProExpiryDate();
  return { isPro: true, ...(expiry ? { expiresAt: expiry } : {}) };
}
