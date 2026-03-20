/**
 * rateLimiter.ts — Token-bucket rate limiter for AI provider API calls.
 *
 * Prevents hitting provider rate limits by throttling outgoing requests.
 * Each provider gets its own limiter instance with a configured max req/min.
 *
 * Usage:
 *   await rateLimiter.acquire('gemini');
 *   // ... make API call
 */

interface BucketState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

const buckets = new Map<string, BucketState>();

/** Default rate limits per provider (requests per minute, with safety margin) */
const DEFAULT_LIMITS: Record<string, number> = {
  gemini: 12,    // Gemini free tier: 15 req/min, safety margin
  anthropic: 30, // Anthropic: higher limit
  openai: 30,    // OpenAI: higher limit
  builtin: 10,   // Built-in proxy: conservative
};

function getBucket(provider: string): BucketState {
  let bucket = buckets.get(provider);
  if (!bucket) {
    const maxTokens = DEFAULT_LIMITS[provider] ?? 12;
    bucket = {
      tokens: maxTokens,
      lastRefill: Date.now(),
      maxTokens,
      refillRate: maxTokens / 60000, // tokens per ms
    };
    buckets.set(provider, bucket);
  }
  return bucket;
}

function refill(bucket: BucketState): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRate);
    bucket.lastRefill = now;
  }
}

/**
 * Acquire a token for the given provider. Resolves when a token is available.
 * If tokens are available, resolves immediately. Otherwise, waits until a token
 * is replenished.
 */
export function acquire(provider: string): Promise<void> {
  const bucket = getBucket(provider);
  refill(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return Promise.resolve();
  }

  // Calculate wait time until 1 token is available
  const deficit = 1 - bucket.tokens;
  const waitMs = Math.ceil(deficit / bucket.refillRate);

  return new Promise((resolve) => {
    setTimeout(() => {
      refill(bucket);
      bucket.tokens = Math.max(0, bucket.tokens - 1);
      resolve();
    }, waitMs);
  });
}

/** Reset a provider's bucket (useful for testing) */
export function reset(provider?: string): void {
  if (provider) {
    buckets.delete(provider);
  } else {
    buckets.clear();
  }
}
