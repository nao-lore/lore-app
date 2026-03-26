import { safeGetItem, safeSetItem } from '../storage/core';
import { isPro } from './proManager';
import { todayISO } from './dateFormat';

// ─── Constants ───

export const DAILY_LIMIT_FREE = 20;

// Daily usage is tracked both client-side (localStorage) and server-side (IP-based).
// The server returns X-RateLimit-Remaining which is stored in threadlog_builtin_usage.
// The client counter (threadlog_daily_usage) is used as a fallback display and
// is synced with the server counter when a transform completes.

const DAILY_USAGE_KEY = 'threadlog_daily_usage';

// ─── Daily Usage ───

interface DailyUsage {
  date: string;
  count: number;
}

function parseDailyUsage(): DailyUsage | null {
  const raw = safeGetItem(DAILY_USAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'date' in parsed && 'count' in parsed &&
      typeof (parsed as DailyUsage).date === 'string' &&
      typeof (parsed as DailyUsage).count === 'number'
    ) {
      return parsed as DailyUsage;
    }
  } catch { /* invalid JSON */ }
  return null;
}

/** Returns today's transform usage count. Resets if the date has changed. */
export function getDailyUsageCount(): number {
  const today = todayISO();
  const usage = parseDailyUsage();
  if (!usage || usage.date !== today) return 0;
  return usage.count;
}

/** Increments today's transform counter. */
export function incrementDailyUsage(): void {
  const today = todayISO();
  const usage = parseDailyUsage();
  const count = (usage && usage.date === today) ? usage.count + 1 : 1;
  safeSetItem(DAILY_USAGE_KEY, JSON.stringify({ date: today, count }));
}

// ─── Main check ───

export interface CanTransformResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

/**
 * Main guard: determines whether a transform is allowed.
 * Returns { allowed, reason?, remaining? }.
 */
export function canTransform(): CanTransformResult {
  // Pro users bypass all limits
  if (isPro()) return { allowed: true };

  // Enforce daily limit
  const used = getDailyUsageCount();
  const remaining = Math.max(0, DAILY_LIMIT_FREE - used);

  if (remaining <= 0) {
    return { allowed: false, reason: 'daily_limit_reached', remaining: 0 };
  }

  return { allowed: true, remaining };
}

