/**
 * Retry with exponential backoff for transient API errors (429, 503).
 */

/** Execute fn with automatic retry on transient errors */
export async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const isRetryable = err instanceof Error && (
        err.message.includes('429') || err.message.includes('503') || err.message.includes('overloaded') || err.message.includes('[Overloaded]') || err.message.includes('[Rate Limit]')
      );
      if (!isRetryable) throw err;
      const delayMatch = err instanceof Error ? err.message.match(/\[Rate Limit:(\d+)\]/) : null;
      const delay = delayMatch ? parseInt(delayMatch[1], 10) * 1000 : 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
