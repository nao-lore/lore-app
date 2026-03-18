/**
 * chunkEngine.test.ts — Unit tests for chunk engine utility functions
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';

// Mock dependencies so the module loads without side effects
vi.mock('../storage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
  safeRemoveItem: vi.fn(),
  getLang: vi.fn(() => 'en'),
}));
vi.mock('../provider', () => ({
  callProvider: vi.fn(),
  callProviderStream: vi.fn(),
  getActiveProvider: vi.fn(() => 'gemini'),
}));
vi.mock('../chunkDb', () => ({
  computeSourceHash: vi.fn(() => 'hash'),
  loadSession: vi.fn(() => null),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('../transform', () => ({
  filterResolvedBlockers: vi.fn((arr: unknown[]) => arr),
  normalizeNextActions: vi.fn((arr: unknown[]) => ({
    nextActions: arr.map((a: unknown) => (typeof a === 'string' ? a : '')),
    nextActionItems: arr.map((a: unknown) => {
      if (typeof a === 'object' && a !== null && 'action' in (a as Record<string, unknown>)) {
        return a;
      }
      return { action: String(a), whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null };
    }),
  })),
  normalizeResumeChecklist: vi.fn((arr: unknown[]) => arr),
  normalizeHandoffMeta: vi.fn((obj: unknown) => obj),
  normalizeActionBacklog: vi.fn((arr: unknown[]) => arr.map((a: unknown) => {
    if (typeof a === 'object' && a !== null) return a;
    return { action: String(a), whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null };
  })),
}));
vi.mock('../utils/decisions', () => ({
  dedupStrings: vi.fn((arr: string[]) => [...new Set(arr)]),
  dedupDecisions: vi.fn((arr: unknown[]) => arr),
}));

import { _testOnly, estimateTokens } from '../chunkEngine';

const { splitIntoChunks, tryRepairJson, localMerge, tokenTargetToCharLimit } = _testOnly;

// =============================================================================
// estimateTokens
// =============================================================================
describe('estimateTokens', () => {
  it('estimates English text at ~4 chars per token', () => {
    const text = 'Hello world this is a test string with some words';
    const tokens = estimateTokens(text);
    // 49 chars / 4 = ~12.25, ceil = 13
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates CJK text at ~1.5 chars per token', () => {
    const text = 'これはテストの日本語テキストです';
    const tokens = estimateTokens(text);
    // 15 CJK chars / 1.5 = 10
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(20);
  });

  it('handles mixed language text', () => {
    const text = 'React componentのテスト実装';
    const tokens = estimateTokens(text);
    // Mix of ASCII and CJK — should be higher than pure English estimate
    const pureEnglishEstimate = Math.ceil(text.length / 4);
    expect(tokens).toBeGreaterThan(pureEnglishEstimate);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles Korean text as CJK', () => {
    const text = '안녕하세요 테스트입니다';
    const tokens = estimateTokens(text);
    // Korean chars should be counted as CJK (higher token density)
    expect(tokens).toBeGreaterThan(3);
  });
});

// =============================================================================
// tokenTargetToCharLimit
// =============================================================================
describe('tokenTargetToCharLimit', () => {
  it('returns higher char limit for English text', () => {
    const englishText = 'This is a sample English text for testing purposes.';
    const limit = tokenTargetToCharLimit(englishText, 1000);
    // English: ~4 chars/token, so 1000 tokens ≈ 4000 chars
    expect(limit).toBeGreaterThan(3000);
    expect(limit).toBeLessThan(5000);
  });

  it('returns lower char limit for CJK text', () => {
    const japaneseText = 'これはテストの日本語テキストです。開発作業の記録を整理します。';
    const limit = tokenTargetToCharLimit(japaneseText, 1000);
    // CJK: ~1.5 chars/token, so 1000 tokens ≈ 1500 chars
    expect(limit).toBeGreaterThan(1000);
    expect(limit).toBeLessThan(2500);
  });

  it('falls back for empty text', () => {
    const limit = tokenTargetToCharLimit('', 1000);
    expect(limit).toBe(4000); // fallback: tokenTarget * 4
  });
});

// =============================================================================
// splitIntoChunks
// =============================================================================
describe('splitIntoChunks', () => {
  it('splits text at paragraph boundaries', () => {
    const text = 'Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here.';
    const chunks = splitIntoChunks(text, 100);
    // With a target of 100, all paragraphs fit in one chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // The combined text should contain all paragraphs
    const joined = chunks.join('');
    expect(joined).toContain('Paragraph one');
    expect(joined).toContain('Paragraph two');
    expect(joined).toContain('Paragraph three');
  });

  it('produces multiple chunks when text exceeds target size', () => {
    // Create text with many paragraphs, each ~50 chars
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `This is paragraph number ${i + 1} with some filler text here.`
    );
    const text = paragraphs.join('\n\n');
    // Target 200 chars per chunk — should produce multiple chunks
    const chunks = splitIntoChunks(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    // All content should be preserved
    const joined = chunks.join(' ');
    for (const p of paragraphs) {
      expect(joined).toContain(p.trim());
    }
  });

  it('respects max chunk size even with very long input', () => {
    // Create long text with line breaks (groupSegments splits at newlines)
    const lines = Array.from({ length: 2000 }, (_, i) =>
      `Line ${i}: ${'x'.repeat(40)}`
    );
    const longText = lines.join('\n');
    // Target 5000 chars — should produce multiple chunks
    const chunks = splitIntoChunks(longText, 5_000);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should exceed EXTRACT_MAX_CHARS (60_000)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(60_000);
    }
  });

  it('handles file separator format', () => {
    const text = '--- FILE: src/a.ts ---\ncode a\n--- FILE: src/b.ts ---\ncode b';
    const chunks = splitIntoChunks(text, 100);
    const joined = chunks.join('');
    expect(joined).toContain('code a');
    expect(joined).toContain('code b');
  });
});

// =============================================================================
// tryRepairJson
// =============================================================================
describe('tryRepairJson', () => {
  it('parses valid JSON as-is', () => {
    const result = tryRepairJson('{"title":"test","today":["item1"]}');
    expect(result).toEqual({ title: 'test', today: ['item1'] });
  });

  it('fixes trailing commas', () => {
    const result = tryRepairJson('{"title":"test","today":["a","b",],}');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
    expect(result!.today).toEqual(['a', 'b']);
  });

  it('fixes missing closing braces', () => {
    // No closing brace — tryRepairJson adds one
    const result = tryRepairJson('{"title":"test","today":["a"]');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
  });

  it('strips markdown code fences', () => {
    const result = tryRepairJson('```json\n{"title":"test"}\n```');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
  });

  it('strips trailing prose after JSON', () => {
    const result = tryRepairJson('{"title":"test"} Here is some extra text.');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test');
  });

  it('returns null for input with no opening brace', () => {
    const result = tryRepairJson('This is just plain text with no JSON');
    expect(result).toBeNull();
  });
});

// =============================================================================
// localMerge
// =============================================================================
describe('localMerge', () => {
  it('merges two transform results with union for arrays', () => {
    const partials = [
      {
        title: 'First',
        today: ['task A', 'task B'],
        decisions: ['decision 1'],
        todo: ['todo 1'],
        currentStatus: ['status old'],
      },
      {
        title: 'Second',
        today: ['task C'],
        decisions: ['decision 2'],
        todo: ['todo 2'],
        currentStatus: ['status new'],
      },
    ];

    const result = localMerge(partials);

    // today should be the union from both
    expect(result.today).toEqual(expect.arrayContaining(['task A', 'task B', 'task C']));
    // decisions should be the union from both
    expect(result.decisions).toEqual(expect.arrayContaining(['decision 1', 'decision 2']));
    // todo should be the union
    expect(result.todo).toEqual(expect.arrayContaining(['todo 1', 'todo 2']));
  });

  it('uses last-wins for title', () => {
    const partials = [
      { title: 'First Title' },
      { title: 'Second Title' },
    ];
    const result = localMerge(partials);
    expect(result.title).toBe('Second Title');
  });

  it('uses last-chunk-wins for currentStatus', () => {
    const partials = [
      { title: 'A', currentStatus: ['old status'] },
      { title: 'B', currentStatus: ['new status'] },
    ];
    const result = localMerge(partials);
    expect(result.currentStatus).toEqual(['new status']);
  });

  it('handles empty partials array gracefully', () => {
    const result = localMerge([{}]);
    expect(result.title).toBe('Untitled');
    expect(result.today).toEqual([]);
  });

  it('deduplicates array entries', () => {
    const partials = [
      { title: 'A', today: ['same task'] },
      { title: 'B', today: ['same task'] },
    ];
    const result = localMerge(partials);
    // dedup should remove duplicates
    const todayArr = result.today as string[];
    const uniqueCount = new Set(todayArr).size;
    expect(uniqueCount).toBe(todayArr.length);
  });
});
