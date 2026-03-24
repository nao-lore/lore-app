/**
 * useTransformStrategies.test.ts — Unit tests for the AI result cache
 * in useTransformStrategies (pure utility functions, no React needed)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Need to mock provider module before importing
vi.mock('../../provider', () => ({
  PROVIDER_MODEL_LABELS: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
  },
}));

import {
  djb2Hash,
  hashCacheKey,
  getCachedResult,
  setCachedResult,
} from '../../hooks/useTransformStrategies';

describe('djb2Hash', () => {
  it('returns a string', () => {
    expect(typeof djb2Hash('hello')).toBe('string');
  });

  it('produces consistent hashes for the same input', () => {
    expect(djb2Hash('test')).toBe(djb2Hash('test'));
  });

  it('produces different hashes for different inputs', () => {
    expect(djb2Hash('hello')).not.toBe(djb2Hash('world'));
  });

  it('handles empty string', () => {
    expect(typeof djb2Hash('')).toBe('string');
    expect(djb2Hash('')).toBe(djb2Hash(''));
  });

  it('handles long strings', () => {
    const long = 'a'.repeat(10000);
    expect(typeof djb2Hash(long)).toBe('string');
  });

  it('handles unicode', () => {
    expect(typeof djb2Hash('こんにちは')).toBe('string');
  });
});

describe('hashCacheKey', () => {
  it('returns a string hash', () => {
    const key = hashCacheKey('text', 'worklog', 'openai', 'en', 'gpt-4');
    expect(typeof key).toBe('string');
  });

  it('different actions produce different keys', () => {
    const k1 = hashCacheKey('text', 'worklog', 'openai', 'en', 'gpt-4');
    const k2 = hashCacheKey('text', 'handoff', 'openai', 'en', 'gpt-4');
    expect(k1).not.toBe(k2);
  });

  it('different providers produce different keys', () => {
    const k1 = hashCacheKey('text', 'worklog', 'openai', 'en', 'gpt-4');
    const k2 = hashCacheKey('text', 'worklog', 'anthropic', 'en', 'gpt-4');
    expect(k1).not.toBe(k2);
  });

  it('different languages produce different keys', () => {
    const k1 = hashCacheKey('text', 'worklog', 'openai', 'en', 'gpt-4');
    const k2 = hashCacheKey('text', 'worklog', 'openai', 'ja', 'gpt-4');
    expect(k1).not.toBe(k2);
  });

  it('different models produce different keys', () => {
    const k1 = hashCacheKey('text', 'worklog', 'openai', 'en', 'gpt-4');
    const k2 = hashCacheKey('text', 'worklog', 'openai', 'en', 'gpt-4o');
    expect(k1).not.toBe(k2);
  });
});

describe('getCachedResult / setCachedResult — LRU cache', () => {
  beforeEach(() => {
    // Clear cache by setting 25+ entries (max is 20)
    for (let i = 0; i < 25; i++) {
      setCachedResult(`flush-${i}`, 'flush', 'openai', 'en', null);
    }
  });

  it('returns undefined for uncached entries', () => {
    const result = getCachedResult('new-text', 'worklog', 'openai', 'en');
    expect(result).toBeUndefined();
  });

  it('stores and retrieves a cached result', () => {
    const data = { title: 'Test', today: [] };
    setCachedResult('my-text', 'worklog', 'openai', 'en', data);

    const cached = getCachedResult('my-text', 'worklog', 'openai', 'en');
    expect(cached).toEqual(data);
  });

  it('cache miss for different action', () => {
    setCachedResult('my-text', 'worklog', 'openai', 'en', { test: true });
    const cached = getCachedResult('my-text', 'handoff', 'openai', 'en');
    expect(cached).toBeUndefined();
  });

  it('cache miss for different provider', () => {
    setCachedResult('my-text', 'worklog', 'openai', 'en', { test: true });
    const cached = getCachedResult('my-text', 'worklog', 'anthropic', 'en');
    expect(cached).toBeUndefined();
  });

  it('evicts least recently used when cache exceeds max size', () => {
    // Fill cache with 20 entries
    for (let i = 0; i < 20; i++) {
      setCachedResult(`text-${i}`, 'test', 'openai', 'en', { index: i });
    }

    // First entry should still be there
    const first = getCachedResult(`text-0`, 'test', 'openai', 'en');
    expect(first).toBeDefined();

    // Add one more to trigger eviction — text-0 was just accessed (moved to end),
    // so text-1 should be evicted
    setCachedResult('new-entry', 'test', 'openai', 'en', { index: 'new' });

    // text-1 should have been evicted (LRU)
    const evicted = getCachedResult('text-1', 'test', 'openai', 'en');
    expect(evicted).toBeUndefined();

    // new entry should be available
    const newEntry = getCachedResult('new-entry', 'test', 'openai', 'en');
    expect(newEntry).toEqual({ index: 'new' });
  });

  it('respects TTL — expired entries return undefined', () => {
    setCachedResult('ttl-text', 'worklog', 'openai', 'en', { data: 1 });

    // Mock Date.now to simulate expiry (30 minutes + 1ms)
    const originalNow = Date.now;
    Date.now = () => originalNow() + 30 * 60 * 1000 + 1;

    const cached = getCachedResult('ttl-text', 'worklog', 'openai', 'en');
    expect(cached).toBeUndefined();

    Date.now = originalNow;
  });

  it('validate guard rejects invalid entries', () => {
    setCachedResult('guarded', 'worklog', 'openai', 'en', { title: 'Good' });

    // Validator that only accepts objects with a 'today' array
    const validate = (v: unknown): v is { today: string[] } =>
      typeof v === 'object' && v !== null && 'today' in v;

    const cached = getCachedResult('guarded', 'worklog', 'openai', 'en', validate);
    expect(cached).toBeUndefined();
  });

  it('validate guard accepts valid entries', () => {
    const data = { title: 'Good', today: ['item'] };
    setCachedResult('valid', 'worklog', 'openai', 'en', data);

    const validate = (v: unknown): v is { title: string; today: string[] } =>
      typeof v === 'object' && v !== null && 'title' in v;

    const cached = getCachedResult('valid', 'worklog', 'openai', 'en', validate);
    expect(cached).toEqual(data);
  });
});
