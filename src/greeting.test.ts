import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGreeting } from './greeting';

describe('getGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a non-empty string for ja', () => {
    const result = getGreeting('ja');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for en', () => {
    const result = getGreeting('en');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns Japanese morning greeting at 9am', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0));
    const result = getGreeting('ja');
    const jaMorningGreetings = ['おはようございます', 'いい朝ですね', '今日もがんばりましょう', 'さあ、始めましょう'];
    expect(jaMorningGreetings).toContain(result);
  });

  it('is deterministic for same date/hour', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 15, 0, 0));
    const r1 = getGreeting('en');
    const r2 = getGreeting('en');
    expect(r1).toBe(r2);
  });

  it('varies by time of day: morning and evening return different period greetings', () => {
    const jaMorningGreetings = ['おはようございます', 'いい朝ですね', '今日もがんばりましょう', 'さあ、始めましょう'];
    const jaEveningGreetings = ['おつかれさまです', 'もうひと踏ん張り', '今日もお疲れ様', 'いい一日でしたか？'];

    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0));
    const morning = getGreeting('ja');
    vi.setSystemTime(new Date(2026, 2, 12, 20, 0, 0));
    const evening = getGreeting('ja');

    expect(jaMorningGreetings).toContain(morning);
    expect(jaEveningGreetings).toContain(evening);
  });
});
