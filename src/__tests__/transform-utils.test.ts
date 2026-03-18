/**
 * transform-utils.test.ts — Unit tests for pure functions from transform.ts
 */
import { describe, it, expect, vi } from 'vitest';

// Mock localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

import {
  extractJson,
  detectLanguage,
  filterResolvedBlockers,
  normalizeNextActions,
  normalizeResumeChecklist,
  normalizeHandoffMeta,
  normalizeActionBacklog,
  needsChunking,
  buildHandoffLogEntry,
  CHUNK_THRESHOLD,
} from '../transform';
import { AIError } from '../errors';
import type { HandoffResult } from '../types';

// =============================================================================
// extractJson
// =============================================================================

describe('extractJson', () => {
  it('extracts valid JSON object from plain text', () => {
    const result = extractJson('{"title":"hello"}');
    expect(JSON.parse(result)).toEqual({ title: 'hello' });
  });

  it('extracts JSON from markdown code fences', () => {
    const raw = '```json\n{"title":"fenced"}\n```';
    const result = extractJson(raw);
    expect(JSON.parse(result)).toEqual({ title: 'fenced' });
  });

  it('extracts JSON with surrounding prose', () => {
    const raw = 'Here is the result:\n{"title":"embedded","tags":["a"]}\nDone.';
    const result = extractJson(raw);
    expect(JSON.parse(result)).toEqual({ title: 'embedded', tags: ['a'] });
  });

  it('handles nested objects correctly', () => {
    const raw = '{"outer":{"inner":"value"},"list":[1,2]}';
    const result = extractJson(raw);
    expect(JSON.parse(result)).toEqual({ outer: { inner: 'value' }, list: [1, 2] });
  });

  it('handles strings with escaped quotes', () => {
    const raw = '{"title":"say \\"hello\\""}';
    const result = extractJson(raw);
    expect(JSON.parse(result)).toEqual({ title: 'say "hello"' });
  });

  it('throws AIError PARSE_ERROR when no JSON found', () => {
    expect(() => extractJson('no json here')).toThrow(AIError);
    try {
      extractJson('no json here');
    } catch (e) {
      expect(e).toBeInstanceOf(AIError);
      expect((e as AIError).code).toBe('PARSE_ERROR');
    }
  });

  it('throws AIError TRUNCATED for unclosed braces', () => {
    expect(() => extractJson('{"title":"truncated"')).toThrow(AIError);
    try {
      extractJson('{"title":"truncated"');
    } catch (e) {
      expect(e).toBeInstanceOf(AIError);
      expect((e as AIError).code).toBe('TRUNCATED');
      expect((e as AIError).retryable).toBe(true);
    }
  });

  it('handles multiple code fences', () => {
    const raw = '```json\n{"a":1}\n```\nsome text\n```\nmore\n```';
    const result = extractJson(raw);
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  it('handles empty object', () => {
    const result = extractJson('{}');
    expect(JSON.parse(result)).toEqual({});
  });
});

// =============================================================================
// detectLanguage
// =============================================================================

describe('detectLanguage', () => {
  it('detects Japanese text (hiragana/katakana/kanji)', () => {
    expect(detectLanguage('これはテストです。日本語のテキストを検出します。')).toBe('ja');
  });

  it('detects English text', () => {
    expect(detectLanguage('This is a test with only English text and numbers 123.')).toBe('en');
  });

  it('detects Japanese when ratio exceeds 10%', () => {
    // 5 Japanese chars + ~40 ASCII chars => ~12% ratio => 'ja'
    expect(detectLanguage('Hello world this is a test テスト確認中')).toBe('ja');
  });

  it('returns en for empty string', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('returns en for pure ASCII with no Japanese', () => {
    expect(detectLanguage('function foo() { return bar; }')).toBe('en');
  });

  it('detects text with mixed but low Japanese ratio as English', () => {
    // 1 Japanese char in 50+ chars is less than 10%
    const text = 'A very long English text with minimal Japanese 字 content repeated many many times over';
    expect(detectLanguage(text)).toBe('en');
  });
});

// =============================================================================
// filterResolvedBlockers
// =============================================================================

describe('filterResolvedBlockers', () => {
  it('removes blockers that overlap with completed items', () => {
    const blockers = ['API authentication not working', 'Database migration needed'];
    const completed = ['Fixed API authentication issue'];
    const decisions: string[] = [];
    const result = filterResolvedBlockers(blockers, completed, decisions);
    expect(result).toEqual(['Database migration needed']);
  });

  it('removes blockers that overlap with decisions (>=50% keyword match)', () => {
    // "React Vue decision" -> keywords: "react", "vue", "decision" (3)
    // "React Vue decided" -> keywords: "react", "vue", "decided" (3)
    // shared: "react", "vue" = 2/3 = 67% => overlap
    const blockers = ['React Vue decision pending'];
    const completed: string[] = [];
    const decisions = ['React Vue decided final'];
    const result = filterResolvedBlockers(blockers, completed, decisions);
    expect(result).toEqual([]);
  });

  it('returns all blockers when no overlap', () => {
    const blockers = ['Need server access', 'Waiting for design review'];
    const completed = ['Implemented login page'];
    const decisions = ['Using TypeScript'];
    const result = filterResolvedBlockers(blockers, completed, decisions);
    expect(result).toEqual(blockers);
  });

  it('returns all blockers when completed and decisions are empty', () => {
    const blockers = ['Blocker one', 'Blocker two'];
    expect(filterResolvedBlockers(blockers, [], [])).toEqual(blockers);
  });

  it('returns empty array when blockers is empty', () => {
    expect(filterResolvedBlockers([], ['something'], ['else'])).toEqual([]);
  });

  it('handles short keywords (under 3 chars) by ignoring them', () => {
    // Words under 3 chars are filtered out
    const blockers = ['a b c'];
    const completed = ['a b c'];
    // Both have no keywords >= 3 chars, so no overlap detected
    const result = filterResolvedBlockers(blockers, completed, []);
    expect(result).toEqual(['a b c']);
  });
});

// =============================================================================
// normalizeNextActions
// =============================================================================

describe('normalizeNextActions', () => {
  it('handles object format with all fields', () => {
    const raw = [
      { action: 'Deploy to staging', whyImportant: 'Need feedback', priorityReason: 'Deadline', dueBy: 'Friday', dependsOn: ['Build passes'] },
    ];
    const result = normalizeNextActions(raw);
    expect(result.nextActions).toEqual(['Deploy to staging']);
    expect(result.nextActionItems).toHaveLength(1);
    expect(result.nextActionItems[0].whyImportant).toBe('Need feedback');
    expect(result.nextActionItems[0].dependsOn).toEqual(['Build passes']);
  });

  it('handles legacy string format', () => {
    const raw = ['Task A', 'Task B'];
    const result = normalizeNextActions(raw);
    expect(result.nextActions).toEqual(['Task A', 'Task B']);
    expect(result.nextActionItems).toHaveLength(2);
    expect(result.nextActionItems[0].whyImportant).toBeNull();
  });

  it('returns empty for empty array', () => {
    const result = normalizeNextActions([]);
    expect(result.nextActions).toEqual([]);
    expect(result.nextActionItems).toEqual([]);
  });

  it('returns empty for non-array input', () => {
    const result = normalizeNextActions(null as unknown as unknown[]);
    expect(result.nextActions).toEqual([]);
    expect(result.nextActionItems).toEqual([]);
  });

  it('filters out items with empty action', () => {
    const raw = [{ action: 'Valid' }, { action: '' }, { action: '  ' }];
    const result = normalizeNextActions(raw);
    expect(result.nextActions).toEqual(['Valid']);
  });

  it('handles dependsOn with non-string elements', () => {
    const raw = [{ action: 'Task', dependsOn: [123, '', 'Valid dep'] }];
    const result = normalizeNextActions(raw);
    expect(result.nextActionItems[0].dependsOn).toEqual(['Valid dep']);
  });
});

// =============================================================================
// normalizeResumeChecklist
// =============================================================================

describe('normalizeResumeChecklist', () => {
  it('handles object format', () => {
    const raw = [
      { action: 'Run tests', whyNow: 'Verify changes', ifSkipped: 'Bugs in prod' },
    ];
    const result = normalizeResumeChecklist(raw);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('Run tests');
    expect(result[0].whyNow).toBe('Verify changes');
  });

  it('handles legacy string format', () => {
    const raw = ['Check tests', 'Review PR'];
    const result = normalizeResumeChecklist(raw);
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('Check tests');
    expect(result[0].whyNow).toBeNull();
  });

  it('returns empty for empty array', () => {
    expect(normalizeResumeChecklist([])).toEqual([]);
  });

  it('returns empty for non-array', () => {
    expect(normalizeResumeChecklist(null)).toEqual([]);
    expect(normalizeResumeChecklist(undefined)).toEqual([]);
  });

  it('caps at 3 items', () => {
    const raw = [
      { action: 'A' }, { action: 'B' }, { action: 'C' }, { action: 'D' }, { action: 'E' },
    ];
    const result = normalizeResumeChecklist(raw);
    expect(result).toHaveLength(3);
    expect(result[2].action).toBe('C');
  });

  it('filters out empty actions', () => {
    const raw = [{ action: '' }, { action: 'Valid' }];
    const result = normalizeResumeChecklist(raw);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('Valid');
  });
});

// =============================================================================
// normalizeHandoffMeta
// =============================================================================

describe('normalizeHandoffMeta', () => {
  it('returns defaults for null input', () => {
    const result = normalizeHandoffMeta(null);
    expect(result).toEqual({ sessionFocus: null, whyThisSession: null, timePressure: null });
  });

  it('returns defaults for undefined input', () => {
    const result = normalizeHandoffMeta(undefined);
    expect(result).toEqual({ sessionFocus: null, whyThisSession: null, timePressure: null });
  });

  it('extracts valid fields', () => {
    const raw = {
      sessionFocus: 'Deploy feature',
      whyThisSession: 'Deadline tomorrow',
      timePressure: 'High',
    };
    const result = normalizeHandoffMeta(raw);
    expect(result.sessionFocus).toBe('Deploy feature');
    expect(result.whyThisSession).toBe('Deadline tomorrow');
    expect(result.timePressure).toBe('High');
  });

  it('returns null for empty string fields', () => {
    const raw = { sessionFocus: '', whyThisSession: '  ', timePressure: '' };
    const result = normalizeHandoffMeta(raw);
    expect(result.sessionFocus).toBeNull();
    expect(result.whyThisSession).toBeNull();
    expect(result.timePressure).toBeNull();
  });

  it('handles partial fields', () => {
    const raw = { sessionFocus: 'Focus only' };
    const result = normalizeHandoffMeta(raw);
    expect(result.sessionFocus).toBe('Focus only');
    expect(result.whyThisSession).toBeNull();
    expect(result.timePressure).toBeNull();
  });
});

// =============================================================================
// normalizeActionBacklog
// =============================================================================

describe('normalizeActionBacklog', () => {
  it('returns empty for empty array', () => {
    expect(normalizeActionBacklog([])).toEqual([]);
  });

  it('returns empty for non-array', () => {
    expect(normalizeActionBacklog(null)).toEqual([]);
    expect(normalizeActionBacklog(undefined)).toEqual([]);
  });

  it('normalizes valid items', () => {
    const raw = [{ action: 'Future task', whyImportant: 'Nice to have' }];
    const result = normalizeActionBacklog(raw);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('Future task');
  });

  it('caps at 7 items', () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ action: `Task ${i}` }));
    const result = normalizeActionBacklog(raw);
    expect(result).toHaveLength(7);
    expect(result[6].action).toBe('Task 6');
  });

  it('handles legacy string format', () => {
    const raw = ['Backlog A', 'Backlog B'];
    const result = normalizeActionBacklog(raw);
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('Backlog A');
  });
});

// =============================================================================
// needsChunking
// =============================================================================

describe('needsChunking', () => {
  it('returns false for text below threshold', () => {
    expect(needsChunking('short text')).toBe(false);
  });

  it('returns false for text exactly at threshold', () => {
    const text = 'a'.repeat(CHUNK_THRESHOLD);
    expect(needsChunking(text)).toBe(false);
  });

  it('returns true for text above threshold', () => {
    const text = 'a'.repeat(CHUNK_THRESHOLD + 1);
    expect(needsChunking(text)).toBe(true);
  });
});

// =============================================================================
// buildHandoffLogEntry
// =============================================================================

describe('buildHandoffLogEntry', () => {
  const baseHandoffResult: HandoffResult = {
    title: 'Test Handoff',
    currentStatus: ['In progress'],
    nextActions: ['Deploy'],
    nextActionItems: [{ action: 'Deploy', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }],
    completed: ['Setup done'],
    blockers: ['Need access'],
    decisions: ['Use React'],
    decisionRationales: [{ decision: 'Use React', rationale: 'Team familiarity' }],
    constraints: ['Budget limit'],
    resumeContext: ['Check deploy'],
    resumeChecklist: [{ action: 'Check deploy', whyNow: 'Critical', ifSkipped: 'Delay' }],
    handoffMeta: { sessionFocus: 'Deploy', whyThisSession: null, timePressure: null },
    tags: ['react', 'deploy'],
  };

  it('assembles all fields into a LogEntry', () => {
    const entry = buildHandoffLogEntry(baseHandoffResult, {});
    expect(entry.id).toBeDefined();
    expect(entry.title).toBe('Test Handoff');
    expect(entry.outputMode).toBe('handoff');
    expect(entry.currentStatus).toEqual(['In progress']);
    expect(entry.nextActions).toEqual(['Deploy']);
    expect(entry.completed).toEqual(['Setup done']);
    expect(entry.tags).toEqual(['react', 'deploy']);
    expect(entry.createdAt).toBeDefined();
    expect(entry.importedAt).toBeDefined();
  });

  it('includes projectId when provided', () => {
    const entry = buildHandoffLogEntry(baseHandoffResult, { projectId: 'proj-1' });
    expect(entry.projectId).toBe('proj-1');
  });

  it('includes sourceReference when provided', () => {
    const ref = { fileName: 'chat.txt', sourceType: 'file', charCount: 1000 };
    const entry = buildHandoffLogEntry(baseHandoffResult, { sourceReference: ref });
    expect(entry.sourceReference).toEqual(ref);
  });

  it('sets today and todo as empty arrays', () => {
    const entry = buildHandoffLogEntry(baseHandoffResult, {});
    expect(entry.today).toEqual([]);
    expect(entry.todo).toEqual([]);
  });

  it('generates unique IDs for each call', () => {
    const entry1 = buildHandoffLogEntry(baseHandoffResult, {});
    const entry2 = buildHandoffLogEntry(baseHandoffResult, {});
    expect(entry1.id).not.toBe(entry2.id);
  });
});
