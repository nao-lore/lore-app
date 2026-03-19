/**
 * tokenEstimation.test.ts — Unit tests for token estimation utilities
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../provider', () => ({
  getActiveProvider: vi.fn(() => 'gemini'),
}));

import { estimateTokens, tokenTargetToCharLimit, isCJK } from '../utils/tokenEstimation';

describe('isCJK', () => {
  it('detects CJK Unified Ideographs', () => {
    expect(isCJK(0x4E00)).toBe(true);  // first CJK char
    expect(isCJK(0x9FFF)).toBe(true);  // last CJK char
  });

  it('detects Hiragana', () => {
    expect(isCJK('あ'.codePointAt(0)!)).toBe(true);
  });

  it('detects Katakana', () => {
    expect(isCJK('ア'.codePointAt(0)!)).toBe(true);
  });

  it('detects Hangul', () => {
    expect(isCJK('한'.codePointAt(0)!)).toBe(true);
  });

  it('returns false for ASCII', () => {
    expect(isCJK('A'.codePointAt(0)!)).toBe(false);
    expect(isCJK(' '.codePointAt(0)!)).toBe(false);
  });
});

describe('estimateTokens', () => {
  it('estimates English text', () => {
    const text = 'Hello world this is a test string with some words';
    const tokens = estimateTokens(text, 'gemini');
    // 49 chars / 3.5 ≈ 14
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates CJK text', () => {
    const text = 'これはテストの日本語テキストです';
    const tokens = estimateTokens(text, 'gemini');
    // 16 CJK chars / 1.5 = 10.67, ceil = 11
    expect(tokens).toBe(11);
  });

  it('handles mixed language text', () => {
    const text = 'React componentのテスト実装';
    const tokens = estimateTokens(text, 'gemini');
    const pureEnglishEstimate = Math.ceil(text.length / 4);
    expect(tokens).toBeGreaterThan(pureEnglishEstimate);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('', 'gemini')).toBe(0);
  });

  it('uses provider-specific ratios for Anthropic', () => {
    const text = 'Hello world test';
    const geminiTokens = estimateTokens(text, 'gemini');
    const anthropicTokens = estimateTokens(text, 'anthropic');
    // Anthropic has higher english ratio (3.8 vs 3.5), so fewer tokens
    expect(anthropicTokens).toBeLessThanOrEqual(geminiTokens);
  });

  it('uses provider-specific ratios for OpenAI', () => {
    const text = 'Hello world test';
    const openaiTokens = estimateTokens(text, 'openai');
    const geminiTokens = estimateTokens(text, 'gemini');
    // OpenAI has highest english ratio (4.0), so fewest tokens
    expect(openaiTokens).toBeLessThanOrEqual(geminiTokens);
  });

  it('falls back to active provider when none specified', () => {
    const text = 'Hello world';
    // Active provider is mocked as 'gemini'
    const tokens = estimateTokens(text);
    const geminiTokens = estimateTokens(text, 'gemini');
    expect(tokens).toBe(geminiTokens);
  });
});

describe('tokenTargetToCharLimit', () => {
  it('returns higher char limit for English text', () => {
    const text = 'This is a sample English text for testing purposes.';
    const limit = tokenTargetToCharLimit(text, 1000);
    expect(limit).toBeGreaterThan(3000);
    expect(limit).toBeLessThan(5000);
  });

  it('returns lower char limit for CJK text', () => {
    const text = 'これはテストの日本語テキストです。開発作業の記録を整理します。';
    const limit = tokenTargetToCharLimit(text, 1000);
    expect(limit).toBeGreaterThan(1000);
    expect(limit).toBeLessThan(2500);
  });

  it('falls back for empty text', () => {
    const limit = tokenTargetToCharLimit('', 1000);
    expect(limit).toBe(4000);
  });
});
