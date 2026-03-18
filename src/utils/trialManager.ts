import { safeGetItem, safeSetItem } from '../storage/core';
import { isPro } from './proManager';

// ─── Constants ───

export const TRIAL_DAYS = 7;
export const DAILY_LIMIT_FREE = 5;

const TRIAL_START_KEY = 'threadlog_trial_start';
const DAILY_USAGE_KEY = 'threadlog_daily_usage';

// ─── Trial Start Date ───

/** Returns the stored trial start date as an ISO date string, or null if not set. */
export function getTrialStartDate(): string | null {
  return safeGetItem(TRIAL_START_KEY);
}

/** Sets the trial start date if not already set. */
export function initTrial(): void {
  if (!safeGetItem(TRIAL_START_KEY)) {
    safeSetItem(TRIAL_START_KEY, new Date().toISOString().slice(0, 10));
  }
}

/** Checks if the user is within the 7-day trial period. */
export function isInTrialPeriod(): boolean {
  const startStr = safeGetItem(TRIAL_START_KEY);
  if (!startStr) return true; // Not yet initialized — treat as in trial
  const start = new Date(startStr + 'T00:00:00');
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < TRIAL_DAYS;
}

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
  const today = new Date().toISOString().slice(0, 10);
  const usage = parseDailyUsage();
  if (!usage || usage.date !== today) return 0;
  return usage.count;
}

/** Increments today's transform counter. */
export function incrementDailyUsage(): void {
  const today = new Date().toISOString().slice(0, 10);
  const usage = parseDailyUsage();
  const count = (usage && usage.date === today) ? usage.count + 1 : 1;
  safeSetItem(DAILY_USAGE_KEY, JSON.stringify({ date: today, count }));
}

// ─── Main check ───

export interface CanTransformResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  trialDaysLeft?: number;
}

/**
 * Main guard: determines whether a transform is allowed.
 * Returns { allowed, reason?, remaining?, trialDaysLeft? }.
 */
export function canTransform(): CanTransformResult {
  initTrial(); // ensure trial start is recorded

  // Pro users bypass all limits
  if (isPro()) return { allowed: true };

  if (isInTrialPeriod()) {
    const startStr = safeGetItem(TRIAL_START_KEY)!;
    const start = new Date(startStr + 'T00:00:00');
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - diffMs / (1000 * 60 * 60 * 24)));
    return { allowed: true, trialDaysLeft: daysLeft };
  }

  // Post-trial: enforce daily limit
  const used = getDailyUsageCount();
  const remaining = Math.max(0, DAILY_LIMIT_FREE - used);

  if (remaining <= 0) {
    return { allowed: false, reason: 'daily_limit_reached', remaining: 0 };
  }

  return { allowed: true, remaining };
}
