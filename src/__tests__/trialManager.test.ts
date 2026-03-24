import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isInTrialPeriod,
  getDailyUsageCount,
  incrementDailyUsage,
  canTransform,
  DAILY_LIMIT_FREE,
} from '../utils/trialManager';

// Mock localStorage via storage/core's safeGetItem/safeSetItem
const store: Record<string, string> = {};

vi.mock('../storage/core', () => ({
  safeGetItem: (key: string) => store[key] ?? null,
  safeSetItem: (key: string, value: string) => { store[key] = value; },
}));

function clearStore() {
  for (const key of Object.keys(store)) delete store[key];
}

describe('trialManager', () => {
  beforeEach(() => {
    clearStore();
    vi.restoreAllMocks();
  });

  // ─── isInTrialPeriod (deprecated, always false) ───

  it('isInTrialPeriod always returns false (trial removed)', () => {
    expect(isInTrialPeriod()).toBe(false);
  });

  // ─── getDailyUsageCount ───

  it('returns 0 when no usage recorded', () => {
    expect(getDailyUsageCount()).toBe(0);
  });

  it('returns the count for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_daily_usage'] = JSON.stringify({ date: today, count: 3 });
    expect(getDailyUsageCount()).toBe(3);
  });

  it('returns 0 when the stored date is yesterday (date rollover)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store['threadlog_daily_usage'] = JSON.stringify({ date: yesterday.toISOString().slice(0, 10), count: 10 });
    expect(getDailyUsageCount()).toBe(0);
  });

  it('returns 0 for invalid JSON', () => {
    store['threadlog_daily_usage'] = 'not-json';
    expect(getDailyUsageCount()).toBe(0);
  });

  // ─── incrementDailyUsage ───

  it('increments from 0 to 1', () => {
    incrementDailyUsage();
    expect(getDailyUsageCount()).toBe(1);
  });

  it('increments existing count', () => {
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_daily_usage'] = JSON.stringify({ date: today, count: 2 });
    incrementDailyUsage();
    expect(getDailyUsageCount()).toBe(3);
  });

  it('resets count when date changes', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store['threadlog_daily_usage'] = JSON.stringify({ date: yesterday.toISOString().slice(0, 10), count: 99 });
    incrementDailyUsage();
    expect(getDailyUsageCount()).toBe(1);
  });

  // ─── canTransform ───

  it('allows transforms when under daily limit', () => {
    const result = canTransform();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DAILY_LIMIT_FREE);
  });

  it('blocks transforms when daily limit reached', () => {
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_daily_usage'] = JSON.stringify({ date: today, count: DAILY_LIMIT_FREE });
    const result = canTransform();
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily_limit_reached');
    expect(result.remaining).toBe(0);
  });

  it('allows transforms when partially used', () => {
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_daily_usage'] = JSON.stringify({ date: today, count: 3 });
    const result = canTransform();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DAILY_LIMIT_FREE - 3);
  });

  // ─── Constants ───

  it('DAILY_LIMIT_FREE is 20', () => {
    expect(DAILY_LIMIT_FREE).toBe(20);
  });
});
