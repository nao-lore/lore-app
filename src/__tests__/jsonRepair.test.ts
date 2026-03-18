import { describe, it, expect } from 'vitest';
import { repairJson, parseJsonWithRepair } from '../utils/jsonRepair';

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
