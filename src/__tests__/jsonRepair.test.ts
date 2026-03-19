import { describe, it, expect } from 'vitest';
import { repairJson, parseJsonWithRepair, tryRepairJson, balanceBrackets, fixTruncatedStrings } from '../utils/jsonRepair';

describe('repairJson', () => {
  it('removes trailing comma before closing brace', () => {
    const input = '{"a": 1, "b": 2,}';
    expect(JSON.parse(repairJson(input))).toEqual({ a: 1, b: 2 });
  });

  it('removes trailing comma before closing bracket', () => {
    const input = '{"items": [1, 2, 3,]}';
    expect(JSON.parse(repairJson(input))).toEqual({ items: [1, 2, 3] });
  });

  it('adds missing closing brace', () => {
    const input = '{"a": 1, "b": 2';
    expect(JSON.parse(repairJson(input))).toEqual({ a: 1, b: 2 });
  });

  it('adds missing closing bracket', () => {
    const input = '{"items": [1, 2, 3}';
    // After repair: adds ] then no extra } needed (brace already balanced)
    const repaired = repairJson(input);
    expect(repaired).toContain(']');
  });

  it('adds multiple missing closing braces', () => {
    const input = '{"a": {"b": {"c": 1}';
    const repaired = repairJson(input);
    expect(JSON.parse(repaired)).toEqual({ a: { b: { c: 1 } } });
  });

  it('passes through valid JSON unchanged (after trim)', () => {
    const input = '  {"valid": true}  ';
    expect(repairJson(input)).toBe('{"valid": true}');
  });

  it('handles nested trailing commas', () => {
    const input = '{"a": [1, 2,], "b": {"c": 3,},}';
    expect(JSON.parse(repairJson(input))).toEqual({ a: [1, 2], b: { c: 3 } });
  });
});

describe('parseJsonWithRepair', () => {
  it('parses valid JSON directly', () => {
    expect(parseJsonWithRepair('{"a": 1}')).toEqual({ a: 1 });
  });

  it('repairs and parses JSON with trailing comma', () => {
    expect(parseJsonWithRepair('{"a": 1,}')).toEqual({ a: 1 });
  });

  it('repairs and parses JSON with missing closing brace', () => {
    expect(parseJsonWithRepair('{"a": 1')).toEqual({ a: 1 });
  });

  it('throws on completely invalid input', () => {
    expect(() => parseJsonWithRepair('not json at all')).toThrow();
  });

  it('handles complex nested repair', () => {
    const input = '{"title": "Test", "items": [{"id": 1,}, {"id": 2}],}';
    const result = parseJsonWithRepair(input) as Record<string, unknown>;
    expect(result.title).toBe('Test');
    expect((result.items as unknown[]).length).toBe(2);
  });
});

// ── Advanced JSON repair (extracted from chunkEngine) ──

describe('tryRepairJson', () => {
  it('parses valid JSON', () => {
    const result = tryRepairJson('{"title":"test","today":["item1"]}');
    expect(result).toEqual({ title: 'test', today: ['item1'] });
  });

  it('fixes trailing commas', () => {
    const result = tryRepairJson('{"title":"test","today":["a","b",],}');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
  });

  it('fixes missing closing braces (balanced brackets)', () => {
    const result = tryRepairJson('{"title":"test","today":["a"]');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
  });

  it('strips markdown code fences', () => {
    const result = tryRepairJson('```json\n{"title":"test"}\n```');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
  });

  it('fixes single quotes used as delimiters', () => {
    const result = tryRepairJson("{\"title\":'hello'}");
    expect(result).not.toBeNull();
    expect(result!.title).toBe('hello');
  });

  it('returns null for input with no opening brace', () => {
    expect(tryRepairJson('just plain text')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(tryRepairJson('')).toBeNull();
  });

  it('handles truncated strings via fixTruncatedStrings fallback', () => {
    // Simulate truncated JSON where a string value is cut off
    const result = tryRepairJson('{"title":"test","desc":"truncated value');
    // Should either return a repaired object or null (not crash)
    if (result) {
      expect(result.title).toBe('test');
    }
  });
});

describe('balanceBrackets', () => {
  it('closes unclosed braces', () => {
    expect(balanceBrackets('{"a": 1')).toBe('{"a": 1}');
  });

  it('closes unclosed brackets and braces', () => {
    expect(balanceBrackets('{"items": [1, 2')).toBe('{"items": [1, 2]}');
  });

  it('closes unclosed strings', () => {
    const result = balanceBrackets('{"title": "unclosed');
    expect(result).toContain('"');
    expect(result).toContain('}');
  });

  it('leaves balanced JSON unchanged', () => {
    expect(balanceBrackets('{"a": 1}')).toBe('{"a": 1}');
  });
});

describe('fixTruncatedStrings', () => {
  it('returns same text when not truncated', () => {
    const input = '{"a": "value"}';
    expect(fixTruncatedStrings(input)).toBe(input);
  });

  it('fixes truncated mid-string content', () => {
    const input = '{"a": "value", "b": "trunc';
    const result = fixTruncatedStrings(input);
    // Should add closing quote and balance brackets
    expect(result.length).toBeGreaterThan(input.length);
  });
});
