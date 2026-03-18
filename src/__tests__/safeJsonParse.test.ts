import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../utils/safeJsonParse';

describe('safeJsonParse', () => {
  it('parses valid JSON string', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('parses valid JSON array', () => {
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('returns fallback for null input', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', { default: true })).toEqual({ default: true });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('{broken', [])).toEqual([]);
  });

  it('returns fallback for malformed JSON with trailing comma', () => {
    expect(safeJsonParse('{"a":1,}', {})).toEqual({});
  });

  it('preserves type of fallback value', () => {
    const fallback = { items: [], count: 0 };
    const result = safeJsonParse('not json', fallback);
    expect(result).toBe(fallback);
  });

  it('parses nested structures', () => {
    const input = '{"users":[{"name":"Alice"},{"name":"Bob"}]}';
    const result = safeJsonParse<{ users: { name: string }[] }>(input, { users: [] });
    expect(result.users).toHaveLength(2);
    expect(result.users[0].name).toBe('Alice');
  });

  it('parses string values', () => {
    expect(safeJsonParse('"hello"', '')).toBe('hello');
  });

  it('parses numeric values', () => {
    expect(safeJsonParse('42', 0)).toBe(42);
  });

  it('parses boolean values', () => {
    expect(safeJsonParse('true', false)).toBe(true);
  });

  it('returns fallback for undefined-like strings', () => {
    expect(safeJsonParse('undefined', null)).toBe(null);
  });
});
