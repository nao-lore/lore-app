/**
 * Token estimation utilities — provider-specific character-to-token ratios.
 *
 * Extracted from chunkEngine.ts to enable reuse and independent testing.
 */

import type { ProviderName } from '../provider';
import { getActiveProvider } from '../provider';

/** CJK Unicode range check (CJK Unified Ideographs + common ranges) */
export function isCJK(code: number): boolean {
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Unified Ideographs Extension A
    (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
    (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul Syllables
    (code >= 0x20000 && code <= 0x2A6DF)    // CJK Unified Ideographs Extension B
  );
}

/**
 * Provider-specific character-per-token ratios.
 * Each tokenizer behaves differently:
 * - Gemini: ~3.5 chars/token for English, ~1.5 for CJK
 * - Anthropic (Claude): ~3.8 chars/token for English, ~1.3 for CJK
 * - OpenAI: ~4.0 chars/token for English, ~1.5 for CJK
 */
export const TOKEN_RATIOS: Record<ProviderName, { english: number; cjk: number }> = {
  gemini:    { english: 3.5, cjk: 1.5 },
  anthropic: { english: 3.8, cjk: 1.3 },
  openai:    { english: 4.0, cjk: 1.5 },
};

/** Default ratios used when no provider is specified (Gemini-like) */
const DEFAULT_TOKEN_RATIO = TOKEN_RATIOS.gemini;

/**
 * Estimate token count for a string, using provider-specific ratios.
 *
 * Each provider's tokenizer handles English and CJK text differently.
 * When no provider is specified, falls back to the active provider setting,
 * then to Gemini defaults.
 *
 * Uses codePointAt() to correctly handle supplementary plane characters
 * (e.g. CJK Extension B, U+20000+) which are encoded as surrogate pairs in UTF-16.
 */
export function estimateTokens(text: string, provider?: ProviderName): number {
  const ratios = provider
    ? (TOKEN_RATIOS[provider] ?? DEFAULT_TOKEN_RATIO)
    : (TOKEN_RATIOS[getActiveProvider()] ?? DEFAULT_TOKEN_RATIO);

  let asciiChars = 0;
  let cjkChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (isCJK(code)) {
      cjkChars++;
      // Skip the low surrogate of a supplementary character
      if (code > 0xFFFF) i++;
    } else {
      // Skip the low surrogate of any non-CJK supplementary character
      if (code > 0xFFFF) i++;
      asciiChars++;
    }
  }
  return Math.ceil(asciiChars / ratios.english + cjkChars / ratios.cjk);
}

/** Convert a token target to an approximate character limit for the given text */
export function tokenTargetToCharLimit(text: string, tokenTarget: number): number {
  const totalTokens = estimateTokens(text);
  if (totalTokens === 0) return tokenTarget * 4; // fallback
  const charsPerToken = text.length / totalTokens;
  return Math.ceil(tokenTarget * charsPerToken);
}
