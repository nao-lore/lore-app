import { describe, it, expect, beforeEach } from 'vitest';
import { acquire, reset } from '../utils/rateLimiter';

describe('rateLimiter', () => {
  beforeEach(() => {
    reset();
  });

  it('resolves immediately when tokens are available', async () => {
    const start = Date.now();
    await acquire('gemini');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('allows bursts up to the bucket limit', async () => {
    // Gemini default is 12 req/min — should allow 12 immediate calls
    const promises = Array.from({ length: 12 }, () => acquire('gemini'));
    const start = Date.now();
    await Promise.all(promises);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('throttles when bucket is exhausted', async () => {
    // Exhaust all 12 tokens
    for (let i = 0; i < 12; i++) {
      await acquire('gemini');
    }
    // 13th call should wait
    const start = Date.now();
    await acquire('gemini');
    const elapsed = Date.now() - start;
    // Should wait ~5 seconds (60000ms / 12 tokens = 5000ms per token)
    expect(elapsed).toBeGreaterThanOrEqual(3000);
  }, 15000);

  it('uses different buckets for different providers', async () => {
    // Exhaust gemini
    for (let i = 0; i < 12; i++) {
      await acquire('gemini');
    }
    // Anthropic should still be available immediately
    const start = Date.now();
    await acquire('anthropic');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('reset clears specific provider bucket', async () => {
    // Exhaust gemini
    for (let i = 0; i < 12; i++) {
      await acquire('gemini');
    }
    reset('gemini');
    // Should be available immediately after reset
    const start = Date.now();
    await acquire('gemini');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
