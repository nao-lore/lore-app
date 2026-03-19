/**
 * Shared analytics utility — re-exports the track function from @vercel/analytics.
 * This avoids duplicate dynamic imports across modules (main.tsx already loads
 * the analytics module via inject(); this module provides track() without
 * triggering a separate dynamic import each time).
 */

import { track } from '@vercel/analytics';

export { track };
