/**
 * errors.ts — Structured AI error types for transform operations.
 *
 * Provides typed error codes so callers can handle errors programmatically
 * instead of parsing error message strings.
 */

export type AIErrorCode =
  | 'API_KEY_MISSING'
  | 'RATE_LIMIT'
  | 'OVERLOADED'
  | 'TRUNCATED'
  | 'PARSE_ERROR'
  | 'CANCELLED'
  | 'TOO_LONG'
  | 'NETWORK'
  | 'EMPTY_RESPONSE'
  | 'TIMEOUT'
  | 'GENERIC';

export class AIError extends Error {
  code: AIErrorCode;
  retryable: boolean;

  constructor(code: AIErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.retryable = retryable;
  }
}
