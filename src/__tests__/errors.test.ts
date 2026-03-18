/**
 * errors.test.ts — Unit tests for AIError class
 */
import { describe, it, expect } from 'vitest';
import { AIError } from '../errors';
import type { AIErrorCode } from '../errors';

describe('AIError', () => {
  it('constructs with code and message', () => {
    const err = new AIError('PARSE_ERROR', 'Failed to parse');
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.message).toBe('Failed to parse');
    expect(err.retryable).toBe(false);
  });

  it('defaults retryable to false', () => {
    const err = new AIError('NETWORK', 'Network error');
    expect(err.retryable).toBe(false);
  });

  it('accepts retryable = true', () => {
    const err = new AIError('RATE_LIMIT', 'Rate limited', true);
    expect(err.retryable).toBe(true);
  });

  it('is instanceof Error', () => {
    const err = new AIError('GENERIC', 'Something went wrong');
    expect(err).toBeInstanceOf(Error);
  });

  it('is instanceof AIError', () => {
    const err = new AIError('TIMEOUT', 'Timed out');
    expect(err).toBeInstanceOf(AIError);
  });

  it('has name set to AIError', () => {
    const err = new AIError('CANCELLED', 'User cancelled');
    expect(err.name).toBe('AIError');
  });

  it('preserves stack trace', () => {
    const err = new AIError('TRUNCATED', 'Truncated response');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Truncated response');
  });

  it('supports all error codes', () => {
    const codes: AIErrorCode[] = [
      'API_KEY_MISSING', 'RATE_LIMIT', 'OVERLOADED', 'TRUNCATED',
      'PARSE_ERROR', 'CANCELLED', 'TOO_LONG', 'NETWORK',
      'EMPTY_RESPONSE', 'TIMEOUT', 'GENERIC',
    ];
    for (const code of codes) {
      const err = new AIError(code, `Error: ${code}`);
      expect(err.code).toBe(code);
    }
  });
});
