/**
 * provider.test.ts — Unit tests for the provider module
 * @vitest-environment jsdom
 *
 * Uses Anthropic for most tests to avoid Gemini's multi-model fallback loop.
 * For retry tests, we mock at a higher level by intercepting callProviderWithRetry's
 * behavior through the exported callProvider. Fake timers + AbortController timeouts
 * make direct retry testing fragile, so we verify retry semantics through observable
 * outcomes: fetch call count and final result.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Suppress unhandled rejections from lingering AbortController timeouts
// when fake timers are used with the retry loop.
/* eslint-disable @typescript-eslint/no-explicit-any */
const _process = (globalThis as Record<string, unknown>).process as { listeners?: (e: string) => unknown[]; removeAllListeners?: (e: string) => void; on?: (e: string, fn: unknown) => void } || {};
const origListeners = _process.listeners?.('unhandledRejection') ?? [];
beforeEach(() => {
  _process.removeAllListeners?.('unhandledRejection');
  _process.on?.('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    // Suppress known retry-related errors from provider tests
    if (
      msg.includes('[Rate Limit]') ||
      msg.includes('[Overloaded]') ||
      msg.includes('[Rate Limit:')
    ) {
      return; // swallow
    }
    // Re-throw unexpected rejections
    throw reason;
  });
});
afterEach(() => {
  _process.removeAllListeners?.('unhandledRejection');
  for (const listener of origListeners) {
    _process.on?.('unhandledRejection', listener as (...args: unknown[]) => void);
  }
});

// Mock storage before importing provider
vi.mock('../storage', () => ({
  safeGetItem: vi.fn((key: string) => {
    if (key === 'threadlog_provider') return mockProvider;
    if (key.startsWith('threadlog_api_key_')) {
      const provider = key.replace('threadlog_api_key_', '');
      return mockApiKeys[provider] ?? null;
    }
    return null;
  }),
  safeSetItem: vi.fn(),
  safeRemoveItem: vi.fn(),
}));

let mockProvider: string | null = 'gemini';
let mockApiKeys: Record<string, string | null> = {};

import { callProvider } from '../provider';

// ---------- helpers ----------

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  });
}

function mockFetchError(status: number, body: string | object = '') {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(typeof body === 'object' ? body : {}),
    text: () => Promise.resolve(bodyStr),
    headers: new Headers(),
  });
}

const baseReq = {
  apiKey: 'test-key-123',
  system: 'You are helpful.',
  userMessage: 'Hello',
  maxTokens: 100,
};

describe('provider', () => {
  beforeEach(() => {
    mockProvider = 'gemini';
    mockApiKeys = {};
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // callProvider routes to correct provider
  // -----------------------------------------------------------------------
  describe('callProvider routing', () => {
    it('routes to Gemini when provider is gemini', async () => {
      mockProvider = 'gemini';
      mockApiKeys = { gemini: 'AIza-test-key' };

      const geminiResponse = {
        candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }],
      };
      globalThis.fetch = mockFetchOk(geminiResponse);

      const result = await callProvider({ ...baseReq, apiKey: 'AIza-test-key' });
      expect(result).toBe('Gemini response');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object),
      );
    });

    it('routes to Anthropic when provider is anthropic', async () => {
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };

      const anthropicResponse = {
        content: [{ text: 'Anthropic response' }],
      };
      globalThis.fetch = mockFetchOk(anthropicResponse);

      const result = await callProvider({ ...baseReq, apiKey: 'sk-ant-test' });
      expect(result).toBe('Anthropic response');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.anthropic.com'),
        expect.any(Object),
      );
    });

    it('routes to OpenAI when provider is openai', async () => {
      mockProvider = 'openai';
      mockApiKeys = { openai: 'sk-test' };

      const openaiResponse = {
        choices: [{ message: { content: 'OpenAI response' } }],
      };
      globalThis.fetch = mockFetchOk(openaiResponse);

      const result = await callProvider({ ...baseReq, apiKey: 'sk-test' });
      expect(result).toBe('OpenAI response');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openai.com'),
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // callProvider with no API key falls back to builtin proxy
  // -----------------------------------------------------------------------
  describe('callProvider with no API key', () => {
    it('falls back to builtin API when no key is configured', async () => {
      mockProvider = 'gemini';
      mockApiKeys = {}; // no keys

      const builtinResponse = {
        candidates: [{ content: { parts: [{ text: 'builtin response' }] } }],
      };
      globalThis.fetch = mockFetchOk(builtinResponse);

      const result = await callProvider(baseReq);
      expect(result).toBe('builtin response');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/generate',
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // handleHttpError maps status codes
  // -----------------------------------------------------------------------
  describe('handleHttpError via callProvider', () => {
    it('maps 401 to auth error', async () => {
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };
      globalThis.fetch = mockFetchError(401, '');

      await expect(callProvider({ ...baseReq, apiKey: 'sk-ant-test' }))
        .rejects.toThrow('[API Key]');
    });

    it('maps 429 to rate limit error (exhausts retries)', async () => {
      vi.useFakeTimers();
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };
      globalThis.fetch = mockFetchError(429, '');

      const promise = callProvider({ ...baseReq, apiKey: 'sk-ant-test' });

      // Advance through retry delays (1s + 2s + 4s = 7s) one second at a time
      for (let i = 0; i < 8; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await expect(promise).rejects.toThrow('[Rate Limit]');
    });

    it('maps 503 to overloaded error (exhausts retries)', async () => {
      vi.useFakeTimers();
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };
      globalThis.fetch = mockFetchError(503, '');

      const promise = callProvider({ ...baseReq, apiKey: 'sk-ant-test' });

      for (let i = 0; i < 8; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await expect(promise).rejects.toThrow('[Overloaded]');
    });
  });

  // -----------------------------------------------------------------------
  // callProviderWithRetry
  // -----------------------------------------------------------------------
  describe('retry behavior', () => {
    it('retries on 429 errors and succeeds after recovery', async () => {
      vi.useFakeTimers();
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: () => Promise.resolve(''),
            headers: new Headers(),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            content: [{ text: 'success after retry' }],
          }),
          text: () => Promise.resolve(''),
          headers: new Headers(),
        });
      });

      const promise = callProvider({ ...baseReq, apiKey: 'sk-ant-test' });

      // Advance through retry delays
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;
      expect(result).toBe('success after retry');
      // Should have retried at least once (callCount >= 3)
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('does NOT retry on 401 errors', async () => {
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve(''),
          headers: new Headers(),
        });
      });

      await expect(callProvider({ ...baseReq, apiKey: 'sk-ant-test' }))
        .rejects.toThrow('[API Key]');

      // 401 is not retryable — only called once
      expect(callCount).toBe(1);
    });

    it('uses parsed [Rate Limit:N] delay from error body', async () => {
      // This test verifies that handleHttpError parses the retryDelay from
      // the 429 response body and includes it in the error message.
      // Testing the full retry loop with fake timers is unreliable due to
      // AbortController interactions, so we verify the error message format.
      mockProvider = 'anthropic';
      mockApiKeys = { anthropic: 'sk-ant-test' };

      // Return a 429 with retryDelay in the body, for all attempts
      globalThis.fetch = mockFetchError(429, {
        error: {
          message: 'rate limited',
          details: [{ retryDelay: '5s' }],
        },
      });

      // callProviderWithRetry will exhaust retries and throw the last error.
      // We use fake timers to speed through the retry delays.
      vi.useFakeTimers();
      const promise = callProvider({ ...baseReq, apiKey: 'sk-ant-test' });

      // Advance through all retry delays
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // The final error should contain the parsed delay value
      await expect(promise).rejects.toThrow('[Rate Limit:5]');
    });
  });
});
