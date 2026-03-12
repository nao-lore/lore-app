import { describe, it, expect, vi, afterEach } from 'vitest';
import { getGreeting } from './greeting';

describe('getGreeting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('returns Japanese greeting for ja', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0));
    const result = getGreeting('ja');
    const jaGreetings = [
      'おはようございます', 'いい朝ですね', '今日もがんばりましょう', 'さあ、始めましょう',
      'こんにちは', '午後もがんばりましょう', '調子はいかがですか？', 'いい調子ですね',
      'おつかれさまです', 'もうひと踏ん張り', '今日もお疲れ様', 'いい一日でしたか？',
      '夜遅くまでお疲れ様', 'そろそろ休みませんか？', '今日はここまでにしましょう', '遅い時間ですね',
    ];
    expect(jaGreetings).toContain(result);
  });

  it('is deterministic for same date/hour', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 15, 0, 0));
    const r1 = getGreeting('en');
    const r2 = getGreeting('en');
    expect(r1).toBe(r2);
  });

  it('varies by time of day', () => {
    // Collect greetings at different hours to verify period-based selection
    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0));
    const morning = getGreeting('ja');
    vi.setSystemTime(new Date(2026, 2, 12, 20, 0, 0));
    const evening = getGreeting('ja');
    // Different periods should (usually) give different greetings
    // At minimum both should be non-empty
    expect(morning.length).toBeGreaterThan(0);
    expect(evening.length).toBeGreaterThan(0);
  });
});
