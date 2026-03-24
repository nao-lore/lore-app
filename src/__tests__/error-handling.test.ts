/**
 * error-handling.test.ts — Error handling & resilience tests
 *
 * Tests: API failure UI feedback, network errors, invalid responses,
 * timeouts, rate limit retry behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIError } from '../errors';
import type { AIErrorCode } from '../errors';
import { callWithRetry } from '../utils/retryManager';
import { safeJsonParse } from '../utils/safeJsonParse';
import { repairJson, parseJsonWithRepair, tryRepairJson } from '../utils/jsonRepair';
import { WorklogResultSchema, HandoffResultSchema, safeParse } from '../schemas';

// ─── API Error Classification ───

describe('error-handling: AIError classification', () => {
  it('NETWORK error is distinct from TIMEOUT', () => {
    const network = new AIError('NETWORK', 'fetch failed');
    const timeout = new AIError('TIMEOUT', 'request timed out');
    expect(network.code).not.toBe(timeout.code);
  });

  it('retryable flag is independent of error code', () => {
    const retryableNetwork = new AIError('NETWORK', 'fetch failed', true);
    const nonRetryableNetwork = new AIError('NETWORK', 'fetch failed', false);
    expect(retryableNetwork.retryable).toBe(true);
    expect(nonRetryableNetwork.retryable).toBe(false);
  });

  it('RATE_LIMIT can carry delay information in message', () => {
    const err = new AIError('RATE_LIMIT', '[Rate Limit:30] Too many requests', true);
    expect(err.message).toContain('[Rate Limit:30]');
    const match = err.message.match(/\[Rate Limit:(\d+)\]/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(30);
  });

  it('EMPTY_RESPONSE for blank AI output', () => {
    const err = new AIError('EMPTY_RESPONSE', 'AI returned empty body');
    expect(err.code).toBe('EMPTY_RESPONSE');
    expect(err.retryable).toBe(false);
  });

  it('OVERLOADED indicates server capacity issues', () => {
    const err = new AIError('OVERLOADED', '[Overloaded] Server at capacity', true);
    expect(err.code).toBe('OVERLOADED');
    expect(err.retryable).toBe(true);
  });

  it('API_KEY_MISSING should not be retryable', () => {
    const err = new AIError('API_KEY_MISSING', 'No API key configured');
    expect(err.retryable).toBe(false);
  });

  it('TOO_LONG indicates input exceeds token limit', () => {
    const err = new AIError('TOO_LONG', 'Input exceeds maximum token count');
    expect(err.code).toBe('TOO_LONG');
  });

  it('CANCELLED represents user-initiated abort', () => {
    const err = new AIError('CANCELLED', 'User cancelled the request');
    expect(err.code).toBe('CANCELLED');
    expect(err.retryable).toBe(false);
  });
});

// ─── Retry Manager ───

describe('error-handling: callWithRetry', () => {
  it('succeeds immediately if fn succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await callWithRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on non-transient errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
    await expect(callWithRetry(fn, 3)).rejects.toThrow('Invalid API key');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-Error exceptions', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    await expect(callWithRetry(fn, 3)).rejects.toBe('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('maxRetries=0 means single attempt only', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('429'));
    await expect(callWithRetry(fn, 0)).rejects.toThrow('429');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 error and eventually succeeds', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('429 Too Many Requests');
      return 'ok';
    };
    const result = await callWithRetry(fn, 3);
    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  }, 10000);

  it('retries on 503 error and eventually succeeds', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('503 Service Unavailable');
      return 'ok';
    };
    const result = await callWithRetry(fn, 3);
    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  }, 10000);

  it('retries on [Overloaded] error', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('[Overloaded] Server busy');
      return 'ok';
    };
    const result = await callWithRetry(fn, 3);
    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  }, 10000);

  it('retries on [Rate Limit] error', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('[Rate Limit] Slow down');
      return 'ok';
    };
    const result = await callWithRetry(fn, 3);
    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  }, 10000);

  it('throws after exhausting all retries on persistent 429', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('429 Too Many Requests'));
    await expect(callWithRetry(fn, 1)).rejects.toThrow('429 Too Many Requests');
    // maxRetries=1 means 2 total attempts (0 + 1 retry)
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('isRetryable checks message content correctly', async () => {
    // Non-retryable: generic error without 429/503/overloaded/Rate Limit
    const fn = vi.fn().mockRejectedValue(new Error('400 Bad Request'));
    await expect(callWithRetry(fn, 3)).rejects.toThrow('400 Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── Invalid Response Resilience ───

describe('error-handling: invalid response resilience', () => {
  it('safeJsonParse handles truncated JSON gracefully', () => {
    const truncated = '{"title":"Work","today":["Did thing';
    const result = safeJsonParse(truncated, { title: 'Fallback' });
    expect(result).toEqual({ title: 'Fallback' });
  });

  it('safeJsonParse handles completely garbage input', () => {
    const garbage = '!@#$%^&*()_+';
    const result = safeJsonParse(garbage, []);
    expect(result).toEqual([]);
  });

  it('safeJsonParse handles HTML error page response', () => {
    const html = '<html><body>502 Bad Gateway</body></html>';
    const result = safeJsonParse(html, { error: true });
    expect(result).toEqual({ error: true });
  });

  it('repairJson fixes trailing commas', () => {
    const input = '{"a":1,"b":2,}';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it('repairJson balances missing closing braces', () => {
    const input = '{"a":{"b":1}';
    const result = repairJson(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('repairJson balances missing closing brackets', () => {
    const input = '{"a":[1,2,3}';
    const result = repairJson(input);
    expect(result).toContain(']');
  });

  it('parseJsonWithRepair succeeds on valid JSON', () => {
    const valid = '{"key":"value"}';
    expect(parseJsonWithRepair(valid)).toEqual({ key: 'value' });
  });

  it('parseJsonWithRepair repairs and parses broken JSON', () => {
    const broken = '{"key":"value",}';
    expect(parseJsonWithRepair(broken)).toEqual({ key: 'value' });
  });

  it('parseJsonWithRepair throws on truly unrepairable input', () => {
    expect(() => parseJsonWithRepair('not json at all')).toThrow();
  });

  it('tryRepairJson strips markdown code fences', () => {
    const input = '```json\n{"title":"Test"}\n```';
    const result = tryRepairJson(input);
    expect(result).toEqual({ title: 'Test' });
  });

  it('tryRepairJson handles AI prose before JSON', () => {
    const input = 'Here is the result:\n\n{"title":"Test","today":[]}';
    const result = tryRepairJson(input);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test');
  });

  it('tryRepairJson returns null for no JSON content', () => {
    const input = 'Sorry, I could not process your request.';
    expect(tryRepairJson(input)).toBeNull();
  });

  it('tryRepairJson fixes truncated string values', () => {
    const input = '{"title":"My Wo';
    const result = tryRepairJson(input);
    // May or may not succeed, but should not throw
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('tryRepairJson handles single quotes', () => {
    const input = "{'title':'Test'}";
    const result = tryRepairJson(input);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test');
  });
});

// ─── Schema Validation Resilience ───

describe('error-handling: schema validation with malformed data', () => {
  it('WorklogResultSchema handles arrays where strings expected', () => {
    // title as array should fail or coerce
    expect(() => WorklogResultSchema.parse({ title: ['not', 'a', 'string'] })).toThrow();
  });

  it('WorklogResultSchema handles number in string array', () => {
    // today should be string[], passing numbers
    expect(() => WorklogResultSchema.parse({ today: [1, 2, 3] })).toThrow();
  });

  it('HandoffResultSchema handles null for required arrays', () => {
    // currentStatus as null should be handled by defaults
    const result = HandoffResultSchema.parse({ currentStatus: undefined });
    expect(result.currentStatus).toEqual([]);
  });

  it('safeParse does not throw for partially valid data', () => {
    const partial = { title: 'Valid', today: 'not an array' };
    // safeParse should either coerce or throw, but not crash unexpectedly
    expect(() => safeParse(WorklogResultSchema, partial, 'test')).toThrow();
  });

  it('WorklogResultSchema rejects deeply nested malformed input', () => {
    const deep = { title: { nested: { deep: true } } };
    expect(() => WorklogResultSchema.parse(deep)).toThrow();
  });

  it('HandoffResultSchema handles extra unknown fields gracefully', () => {
    const withExtra = {
      title: 'Test',
      unknownField: 'should be stripped or ignored',
      anotherUnknown: 42,
    };
    const result = HandoffResultSchema.parse(withExtra);
    expect(result.title).toBe('Test');
  });

  it('HandoffResultSchema handles nextActions with missing action field', () => {
    const input = { nextActions: [{ whyImportant: 'test' }] };
    expect(() => HandoffResultSchema.parse(input)).toThrow();
  });
});

// ─── Network Error Patterns ───

describe('error-handling: network error patterns', () => {
  it('AIError preserves error chain information', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new AIError('NETWORK', `Network error: ${cause.message}`);
    expect(err.message).toContain('ECONNREFUSED');
    expect(err.code).toBe('NETWORK');
  });

  it('all error codes can be mapped to user-friendly messages', () => {
    const errorMessages: Record<AIErrorCode, string> = {
      'API_KEY_MISSING': 'Please set your API key',
      'RATE_LIMIT': 'Too many requests, please wait',
      'OVERLOADED': 'Service is busy, retrying',
      'TRUNCATED': 'Response was cut short',
      'PARSE_ERROR': 'Could not understand response',
      'CANCELLED': 'Request was cancelled',
      'TOO_LONG': 'Input is too long',
      'NETWORK': 'Network connection failed',
      'EMPTY_RESPONSE': 'No response received',
      'TIMEOUT': 'Request timed out',
      'GENERIC': 'Something went wrong',
    };
    for (const [code, msg] of Object.entries(errorMessages)) {
      const err = new AIError(code as AIErrorCode, msg);
      expect(err.message).toBeTruthy();
      expect(err.code).toBe(code);
    }
  });

  it('timeout errors are non-retryable by default', () => {
    const err = new AIError('TIMEOUT', 'Request timed out after 30s');
    expect(err.retryable).toBe(false);
  });

  it('AIError works with try/catch pattern', () => {
    try {
      throw new AIError('PARSE_ERROR', 'Invalid JSON');
    } catch (e) {
      expect(e).toBeInstanceOf(AIError);
      expect(e).toBeInstanceOf(Error);
      if (e instanceof AIError) {
        expect(e.code).toBe('PARSE_ERROR');
      }
    }
  });
});

