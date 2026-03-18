import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTrialStartDate,
  initTrial,
  isInTrialPeriod,
  getDailyUsageCount,
  incrementDailyUsage,
  canTransform,
  TRIAL_DAYS,
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

  // ─── getTrialStartDate ───

  it('returns null when no trial has been started', () => {
    expect(getTrialStartDate()).toBeNull();
  });

  it('returns the stored date after initTrial', () => {
    initTrial();
    const d = getTrialStartDate();
    expect(d).toBeTruthy();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // ─── initTrial ───

  it('does not overwrite an existing trial start date', () => {
    store['threadlog_trial_start'] = '2025-01-01';
    initTrial();
    expect(getTrialStartDate()).toBe('2025-01-01');
  });

  // ─── isInTrialPeriod ───

  it('returns true when no trial start exists (first visit)', () => {
    expect(isInTrialPeriod()).toBe(true);
  });

  it('returns true when within 7 days', () => {
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_trial_start'] = today;
    expect(isInTrialPeriod()).toBe(true);
  });

  it('returns false when past 7 days', () => {
    const past = new Date();
    past.setDate(past.getDate() - 8);
    store['threadlog_trial_start'] = past.toISOString().slice(0, 10);
    expect(isInTrialPeriod()).toBe(false);
  });

  it('returns false on exactly day 7 boundary', () => {
    const past = new Date();
    past.setDate(past.getDate() - 7);
    store['threadlog_trial_start'] = past.toISOString().slice(0, 10);
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

  it('allows transforms during trial period', () => {
    const result = canTransform();
    expect(result.allowed).toBe(true);
    expect(result.trialDaysLeft).toBeDefined();
    expect(result.trialDaysLeft).toBeGreaterThan(0);
  });

  it('allows transforms post-trial when under daily limit', () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    store['threadlog_trial_start'] = past.toISOString().slice(0, 10);
    const result = canTransform();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DAILY_LIMIT_FREE);
    expect(result.trialDaysLeft).toBeUndefined();
  });

  it('blocks transforms post-trial when daily limit reached', () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    store['threadlog_trial_start'] = past.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_daily_usage'] = JSON.stringify({ date: today, count: DAILY_LIMIT_FREE });
    const result = canTransform();
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily_limit_reached');
    expect(result.remaining).toBe(0);
  });

  it('allows transforms post-trial when partially used', () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    store['threadlog_trial_start'] = past.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    store['threadlog_daily_usage'] = JSON.stringify({ date: today, count: 3 });
    const result = canTransform();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DAILY_LIMIT_FREE - 3);
  });

  it('initializes trial on first canTransform call', () => {
    expect(getTrialStartDate()).toBeNull();
    canTransform();
    expect(getTrialStartDate()).toBeTruthy();
  });

  // ─── Constants ───

  it('TRIAL_DAYS is 7', () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it('DAILY_LIMIT_FREE is 30', () => {
    expect(DAILY_LIMIT_FREE).toBe(30);
  });
});
