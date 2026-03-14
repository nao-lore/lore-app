import { describe, it, expect } from 'vitest';
import {
  extractJson,
  filterResolvedBlockers,
  detectLanguage,
  needsChunking,
  isOverLimit,
  CHUNK_THRESHOLD,
  INPUT_HARD_LIMIT,
} from './transform';

// =============================================================================
// extractJson
// =============================================================================

describe('extractJson', () => {
  it('parses a plain JSON string', () => {
    const input = '{"title":"hello","today":["did stuff"]}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ title: 'hello', today: ['did stuff'] });
  });

  it('extracts JSON wrapped in markdown code fence', () => {
    const input = '```json\n{"title":"fenced"}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ title: 'fenced' });
  });

  it('extracts JSON from ```json fence with extra whitespace', () => {
    const input = '  ```json  \n  {"key": "value"}  \n  ```  ';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('extracts JSON with text before and after', () => {
    const input = 'Here is the result:\n{"title":"extracted"}\nHope that helps!';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ title: 'extracted' });
  });

  it('handles nested JSON objects', () => {
    const input = '{"outer":{"inner":{"deep":"value"}},"arr":[1,2]}';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.outer.inner.deep).toBe('value');
    expect(parsed.arr).toEqual([1, 2]);
  });

  it('handles JSON with strings containing braces', () => {
    const input = '{"code":"function() { return {}; }"}';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe('function() { return {}; }');
  });

  it('handles JSON with escaped quotes in strings', () => {
    const input = '{"msg":"she said \\"hello\\""}';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.msg).toBe('she said "hello"');
  });

  it('handles JSON with backslashes', () => {
    const input = '{"path":"C:\\\\Users\\\\test"}';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.path).toBe('C:\\Users\\test');
  });

  it('throws on empty string', () => {
    expect(() => extractJson('')).toThrow('[Parse Error]');
  });

  it('throws when no JSON in string', () => {
    expect(() => extractJson('just some plain text without braces')).toThrow('[Parse Error]');
  });

  it('throws on truncated JSON (unclosed braces)', () => {
    const input = '{"title":"hello","items":["a","b"';
    expect(() => extractJson(input)).toThrow('[Truncated]');
  });

  it('extracts first valid JSON object when multiple exist', () => {
    const input = '{"first":"one"} {"second":"two"}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ first: 'one' });
  });

  it('handles JSON with newlines and whitespace inside', () => {
    const input = `{
  "title": "multiline",
  "items": [
    "one",
    "two"
  ]
}`;
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('multiline');
    expect(parsed.items).toEqual(['one', 'two']);
  });

  it('handles code fence without json language tag', () => {
    // The regex specifically looks for ```json, so a bare ``` before the JSON
    // should still be stripped by the second replace
    const input = '```\n{"title":"bare fence"}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ title: 'bare fence' });
  });

  it('handles deeply nested structure', () => {
    const input = '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}';
    const result = extractJson(input);
    expect(JSON.parse(result).a.b.c.d.e).toBe('deep');
  });
});

// =============================================================================
// filterResolvedBlockers
// =============================================================================

describe('filterResolvedBlockers', () => {
  it('filters blocker that overlaps >=50% with a completed item', () => {
    const blockers = ['rate limit causes timeout errors'];
    const completed = ['fixed rate limit timeout errors in API client'];
    const result = filterResolvedBlockers(blockers, completed, []);
    expect(result).toEqual([]);
  });

  it('keeps blocker with <50% keyword overlap', () => {
    const blockers = ['localStorage quota may be exceeded'];
    const completed = ['fixed rate limit timeout errors'];
    const result = filterResolvedBlockers(blockers, completed, []);
    expect(result).toEqual(['localStorage quota may be exceeded']);
  });

  it('returns empty array when blockers array is empty', () => {
    const result = filterResolvedBlockers([], ['something completed'], []);
    expect(result).toEqual([]);
  });

  it('keeps all blockers when completed and decisions are empty', () => {
    const blockers = ['risk one', 'risk two'];
    const result = filterResolvedBlockers(blockers, [], []);
    expect(result).toEqual(['risk one', 'risk two']);
  });

  it('filters blockers that overlap with decisions', () => {
    const blockers = ['need to decide database architecture'];
    const decisions = ['decided on database architecture using PostgreSQL'];
    const result = filterResolvedBlockers(blockers, [], decisions);
    expect(result).toEqual([]);
  });

  it('performs case-insensitive matching', () => {
    const blockers = ['API Rate Limit may cause issues'];
    const completed = ['Fixed api rate limit handling'];
    const result = filterResolvedBlockers(blockers, completed, []);
    expect(result).toEqual([]);
  });

  it('handles mixed resolved and unresolved blockers', () => {
    const blockers = [
      'rate limit causes timeout errors',
      'localStorage quota unknown',
    ];
    const completed = ['fixed rate limit timeout errors'];
    const result = filterResolvedBlockers(blockers, completed, []);
    expect(result).toEqual(['localStorage quota unknown']);
  });

  it('ignores short words (< 3 chars) in overlap calculation', () => {
    // "a" and "is" are < 3 chars, so they should not count
    const blockers = ['a is problem'];
    const completed = ['a is resolved now completely'];
    // "problem" (7 chars) vs "resolved" / "now" / "completely" — no overlap on significant words
    const result = filterResolvedBlockers(blockers, completed, []);
    expect(result).toEqual(['a is problem']);
  });

  it('handles Japanese text blockers', () => {
    const blockers = ['Claude APIのレート制限が不安定'];
    const completed = ['レート制限のリトライ処理を実装した'];
    // Overlapping keyword: "レート制限" (after splitting) — depends on exact splitting
    const result = filterResolvedBlockers(blockers, completed, []);
    // Both contain "レート制限" as part of larger tokens; after split on punctuation,
    // "レート制限が不安定" splits into ["レート制限が不安定"] and
    // "レート制限のリトライ処理を実装した" splits into ["レート制限のリトライ処理を実装した"]
    // These won't match exactly, so blocker is kept
    expect(result).toEqual(['Claude APIのレート制限が不安定']);
  });
});

// =============================================================================
// detectLanguage
// =============================================================================

describe('detectLanguage', () => {
  it('detects Japanese text', () => {
    expect(detectLanguage('今日はReactコンポーネントを修正した')).toBe('ja');
  });

  it('detects English text', () => {
    expect(detectLanguage('Today I fixed the React component and deployed it')).toBe('en');
  });

  it('detects Japanese when mixed with English technical terms', () => {
    // Typical Japanese dev writing: Japanese sentences with English terms
    expect(detectLanguage('APIのレート制限を修正してデプロイした')).toBe('ja');
  });

  it('detects English for pure ASCII text', () => {
    expect(detectLanguage('Implemented the search module and added tests')).toBe('en');
  });

  it('detects Japanese for text with katakana', () => {
    expect(detectLanguage('コンポーネントのリファクタリングを実施')).toBe('ja');
  });

  it('detects Japanese for text with kanji', () => {
    expect(detectLanguage('検索機能の設計と実装を完了')).toBe('ja');
  });

  it('returns en for empty-ish text (low ja ratio)', () => {
    expect(detectLanguage('abc')).toBe('en');
  });
});

// =============================================================================
// needsChunking / isOverLimit (simple threshold functions)
// =============================================================================

describe('needsChunking', () => {
  it('returns false for short text', () => {
    expect(needsChunking('hello')).toBe(false);
  });

  it('returns true for text exceeding CHUNK_THRESHOLD', () => {
    const longText = 'a'.repeat(CHUNK_THRESHOLD + 1);
    expect(needsChunking(longText)).toBe(true);
  });

  it('returns false for text exactly at threshold', () => {
    const text = 'a'.repeat(CHUNK_THRESHOLD);
    expect(needsChunking(text)).toBe(false);
  });
});

describe('isOverLimit', () => {
  it('returns false for short text', () => {
    expect(isOverLimit('hello')).toBe(false);
  });

  it('returns true for text exceeding INPUT_HARD_LIMIT', () => {
    const longText = 'a'.repeat(INPUT_HARD_LIMIT + 1);
    expect(isOverLimit(longText)).toBe(true);
  });

  it('returns false for text exactly at limit', () => {
    const text = 'a'.repeat(INPUT_HARD_LIMIT);
    expect(isOverLimit(text)).toBe(false);
  });
});
