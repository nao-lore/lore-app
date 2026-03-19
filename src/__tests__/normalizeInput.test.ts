/**
 * normalizeInput.test.ts — tests for input text normalization
 */
import { describe, it, expect } from 'vitest';
import { normalizeInput } from '../utils/normalizeInput';

describe('normalizeInput', () => {
  it('returns empty string unchanged', () => {
    expect(normalizeInput('')).toBe('');
  });

  it('applies Unicode NFC normalization', () => {
    // NFD: e + combining acute accent (U+0065 U+0301) → NFC: é (U+00E9)
    const nfd = 'caf\u0065\u0301';
    const result = normalizeInput(nfd);
    expect(result).toBe('caf\u00E9');
  });

  it('collapses 3+ blank lines into 2', () => {
    expect(normalizeInput('a\n\n\nb')).toBe('a\n\nb');
    expect(normalizeInput('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('preserves double newlines (paragraph breaks)', () => {
    expect(normalizeInput('a\n\nb')).toBe('a\n\nb');
  });

  it('converts smart quotes to ASCII', () => {
    expect(normalizeInput('\u201CHello\u201D')).toBe('"Hello"');
    expect(normalizeInput('\u2018world\u2019')).toBe("'world'");
  });

  it('converts em/en dashes to hyphens', () => {
    expect(normalizeInput('a\u2013b\u2014c')).toBe('a-b-c');
  });

  it('converts ellipsis to three dots', () => {
    expect(normalizeInput('wait\u2026')).toBe('wait...');
  });

  it('handles CJK text without corruption', () => {
    const cjk = '日本語テスト';
    expect(normalizeInput(cjk)).toBe(cjk);
  });

  it('handles CJK Extension B characters', () => {
    // U+20000 (𠀀) — CJK Unified Ideographs Extension B
    const extB = '名前: \uD840\uDC00';
    expect(normalizeInput(extB)).toBe(extB);
  });
});
