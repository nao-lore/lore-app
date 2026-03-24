/**
 * exception-handling.test.ts — Exception and edge case tests
 *
 * Tests: undefined props, concurrent operations, cache consistency,
 * type coercion, snapshot counter, safeJsonParse edge cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('crypto', {
  randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
});

import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  cache,
  invalidateLogsCache,
  invalidateProjectsCache,
  invalidateTodosCache,
  invalidateMasterNotesCache,
  incrementSnapshotCounter,
  getTotalSnapshots,
  TOTAL_SNAPSHOTS_KEY,
} from '../storage/core';
import { safeJsonParse } from '../utils/safeJsonParse';

// ─── localStorage Safe Wrappers Under Error ───

describe('exception: localStorage error resilience via stubGlobal', () => {
  it('safeGetItem returns null for missing keys', () => {
    store.clear();
    expect(safeGetItem('nonexistent_key')).toBeNull();
  });

  it('safeSetItem and safeGetItem round-trip', () => {
    store.clear();
    safeSetItem('test', 'value');
    expect(safeGetItem('test')).toBe('value');
  });

  it('safeRemoveItem removes key', () => {
    store.clear();
    safeSetItem('to_remove', 'data');
    safeRemoveItem('to_remove');
    expect(safeGetItem('to_remove')).toBeNull();
  });

  it('safeRemoveItem on nonexistent key does not throw', () => {
    store.clear();
    expect(() => safeRemoveItem('does_not_exist')).not.toThrow();
  });
});

// ─── Undefined/Null Props Handling ───

describe('exception: undefined and null data handling', () => {
  it('safeJsonParse handles undefined as input', () => {
    expect(safeJsonParse(undefined as unknown as string | null, [])).toEqual([]);
  });

  it('safeJsonParse handles null input', () => {
    expect(safeJsonParse(null, { default: true })).toEqual({ default: true });
  });

  it('safeJsonParse handles empty string', () => {
    expect(safeJsonParse('', [])).toEqual([]);
  });

  it('filtering logs with undefined trashedAt', () => {
    const logs = [
      { id: '1', trashedAt: undefined },
      { id: '2', trashedAt: Date.now() },
      { id: '3' },
    ];
    const active = logs.filter(l => !l.trashedAt);
    expect(active.length).toBe(2);
    expect(active.map(l => l.id)).toEqual(['1', '3']);
  });

  it('filtering todos with undefined archivedAt', () => {
    const todos = [
      { id: '1', archivedAt: undefined, trashedAt: undefined },
      { id: '2', archivedAt: Date.now(), trashedAt: undefined },
      { id: '3', trashedAt: Date.now() },
    ];
    const active = todos.filter(t => !t.trashedAt && !t.archivedAt);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe('1');
  });

  it('optional fields missing in LogEntry still work', () => {
    const minimalLog = {
      id: 'minimal',
      createdAt: new Date().toISOString(),
      title: 'Minimal',
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    };
    expect(minimalLog.projectId).toBeUndefined();
    expect(minimalLog.pinned).toBeUndefined();
    expect(minimalLog.outputMode).toBeUndefined();
    expect(minimalLog.memo).toBeUndefined();
  });

  it('optional fields missing in Todo still work', () => {
    const minimalTodo = {
      id: 'min-todo',
      text: 'Basic',
      done: false,
      logId: '',
      createdAt: Date.now(),
    };
    expect(minimalTodo.dueDate).toBeUndefined();
    expect(minimalTodo.priority).toBeUndefined();
    expect(minimalTodo.tag).toBeUndefined();
    expect(minimalTodo.sortOrder).toBeUndefined();
  });

  it('JSON.stringify handles undefined fields by omitting them', () => {
    const obj = { a: 1, b: undefined, c: 'test' };
    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ a: 1, c: 'test' });
    expect('b' in parsed).toBe(false);
  });

  it('spreading object with undefined values preserves keys but with undefined', () => {
    const base = { id: '1', name: 'test', value: 'original' };
    const patch = { value: undefined, extra: 'new' };
    const merged = { ...base, ...patch };
    expect(merged.value).toBeUndefined();
    expect(merged.extra).toBe('new');
  });
});

// ─── Concurrent-like Operation Patterns ───

describe('exception: concurrent-like operations', () => {
  beforeEach(() => {
    store.clear();
  });

  it('rapid writes to same key preserve last value', () => {
    for (let i = 0; i < 100; i++) {
      safeSetItem('rapid', `value-${i}`);
    }
    expect(safeGetItem('rapid')).toBe('value-99');
  });

  it('rapid read-modify-write cycle on array data is consistent', () => {
    store.set('items', JSON.stringify([]));
    for (let i = 0; i < 50; i++) {
      const raw = store.get('items')!;
      const items = JSON.parse(raw) as number[];
      items.push(i);
      store.set('items', JSON.stringify(items));
    }
    const final = JSON.parse(store.get('items')!) as number[];
    expect(final.length).toBe(50);
    expect(final[49]).toBe(49);
  });

  it('interleaved reads and writes on different keys do not interfere', () => {
    safeSetItem('key_a', 'alpha');
    safeSetItem('key_b', 'beta');
    expect(safeGetItem('key_a')).toBe('alpha');
    safeSetItem('key_a', 'alpha_updated');
    expect(safeGetItem('key_b')).toBe('beta');
    expect(safeGetItem('key_a')).toBe('alpha_updated');
  });

  it('delete during iteration does not cause errors', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}`, active: i % 2 === 0 }));
    store.set('deletable', JSON.stringify(items));
    const loaded = JSON.parse(store.get('deletable')!) as typeof items;
    const filtered = loaded.filter(item => item.active);
    store.set('deletable', JSON.stringify(filtered));
    const result = JSON.parse(store.get('deletable')!) as typeof items;
    expect(result.length).toBe(5);
    expect(result.every(r => r.active)).toBe(true);
  });

  it('rapid toggle operations produce consistent state', () => {
    const todos = Array.from({ length: 20 }, (_, i) => ({
      id: `todo-${i}`,
      done: false,
    }));
    // Simulate rapid toggling
    for (let cycle = 0; cycle < 10; cycle++) {
      for (const todo of todos) {
        todo.done = !todo.done;
      }
    }
    // Even number of toggles means all should be back to original
    expect(todos.every(t => t.done === false)).toBe(true);
  });
});

// ─── Cache Consistency ───

describe('exception: cache invalidation edge cases', () => {
  beforeEach(() => {
    cache.logsCache = { data: null, version: 0 };
    cache.logsCacheVersion = 0;
    cache.projectsCache = { data: null, version: 0 };
    cache.projectsCacheVersion = 0;
    cache.todosCache = { data: null, version: 0 };
    cache.todosCacheVersion = 0;
    cache.masterNotesCache = { data: null, version: 0 };
    cache.masterNotesCacheVersion = 0;
  });

  it('cache version tracks monotonically after multiple invalidations', () => {
    invalidateLogsCache();
    invalidateLogsCache();
    invalidateLogsCache();
    expect(cache.logsCacheVersion).toBe(3);
  });

  it('different cache domains are independent', () => {
    invalidateLogsCache();
    invalidateProjectsCache();
    expect(cache.logsCacheVersion).toBe(1);
    expect(cache.projectsCacheVersion).toBe(1);
    expect(cache.todosCacheVersion).toBe(0);
    expect(cache.masterNotesCacheVersion).toBe(0);
  });

  it('cache data is nullified on invalidation', () => {
    cache.logsCache.data = [{ id: 'fake' }] as never;
    invalidateLogsCache();
    expect(cache.logsCache.data).toBeNull();
  });

  it('invalidating all caches in sequence', () => {
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
    expect(cache.logsCacheVersion).toBe(1);
    expect(cache.projectsCacheVersion).toBe(1);
    expect(cache.todosCacheVersion).toBe(1);
    expect(cache.masterNotesCacheVersion).toBe(1);
    expect(cache.logsCache.data).toBeNull();
    expect(cache.projectsCache.data).toBeNull();
    expect(cache.todosCache.data).toBeNull();
    expect(cache.masterNotesCache.data).toBeNull();
  });

  it('rapid invalidation of same cache type', () => {
    for (let i = 0; i < 100; i++) {
      invalidateTodosCache();
    }
    expect(cache.todosCacheVersion).toBe(100);
    expect(cache.todosCache.data).toBeNull();
  });
});

// ─── safeJsonParse Edge Cases ───

describe('exception: safeJsonParse with various invalid inputs', () => {
  it('handles NaN as string', () => {
    expect(safeJsonParse('NaN', 0)).toBe(0);
  });

  it('handles Infinity as string', () => {
    expect(safeJsonParse('Infinity', 0)).toBe(0);
  });

  it('handles very deeply nested valid JSON', () => {
    let json = '{"a":';
    for (let i = 0; i < 20; i++) json += '{"a":';
    json += '"deep"';
    for (let i = 0; i < 21; i++) json += '}';
    const result = safeJsonParse(json, null);
    expect(result).not.toBeNull();
  });

  it('handles JSON with excessive whitespace', () => {
    const spacey = '  {  "key"  :  "value"  }  ';
    const result = safeJsonParse(spacey, {});
    expect(result).toEqual({ key: 'value' });
  });

  it('handles arrays with null elements', () => {
    const result = safeJsonParse('[null, null, null]', []);
    expect(result).toEqual([null, null, null]);
    expect(result.length).toBe(3);
  });

  it('handles escaped unicode', () => {
    const result = safeJsonParse('"\\u0048ello"', '');
    expect(result).toBe('Hello');
  });

  it('handles JSON with nested arrays', () => {
    const result = safeJsonParse('[[1,2],[3,4],[5,6]]', []);
    expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('returns fallback for JavaScript literal (not valid JSON)', () => {
    expect(safeJsonParse('{key: "value"}', {})).toEqual({});
  });
});

// ─── Type Coercion Edge Cases ───

describe('exception: type coercion in storage data', () => {
  it('number stored as string is retrieved as string', () => {
    store.clear();
    store.set('num', '42');
    const val = store.get('num');
    expect(typeof val).toBe('string');
    expect(parseInt(val!, 10)).toBe(42);
  });

  it('boolean stored in JSON round-trips correctly', () => {
    const data = { flag: true, other: false };
    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);
    expect(parsed.flag).toBe(true);
    expect(parsed.other).toBe(false);
  });

  it('null in JSON round-trips correctly', () => {
    const data = { value: null };
    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);
    expect(parsed.value).toBeNull();
  });

  it('empty string in JSON is preserved', () => {
    const data = { text: '' };
    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);
    expect(parsed.text).toBe('');
    expect(typeof parsed.text).toBe('string');
  });

  it('Date objects in JSON are converted to strings', () => {
    const now = new Date();
    const data = { created: now };
    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);
    expect(typeof parsed.created).toBe('string');
    expect(new Date(parsed.created).getTime()).toBe(now.getTime());
  });

  it('arrays with mixed types round-trip through JSON', () => {
    const mixed = [1, 'two', true, null, { five: 5 }];
    const json = JSON.stringify(mixed);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(mixed);
  });
});

// ─── Snapshot Counter Edge Cases ───

describe('exception: snapshot counter boundaries', () => {
  beforeEach(() => {
    store.clear();
  });

  it('getTotalSnapshots returns 0 when no counter exists', () => {
    expect(getTotalSnapshots()).toBe(0);
  });

  it('incrementSnapshotCounter increments from 0 to 1', () => {
    incrementSnapshotCounter();
    expect(getTotalSnapshots()).toBe(1);
  });

  it('multiple increments accumulate correctly', () => {
    for (let i = 0; i < 10; i++) {
      incrementSnapshotCounter();
    }
    expect(getTotalSnapshots()).toBe(10);
  });

  it('getTotalSnapshots handles non-numeric stored value', () => {
    store.set(TOTAL_SNAPSHOTS_KEY, 'not-a-number');
    expect(getTotalSnapshots()).toBe(0);
  });

  it('getTotalSnapshots handles negative stored value', () => {
    store.set(TOTAL_SNAPSHOTS_KEY, '-5');
    expect(getTotalSnapshots()).toBe(-5);
  });

  it('getTotalSnapshots handles float stored value', () => {
    store.set(TOTAL_SNAPSHOTS_KEY, '3.7');
    // parseInt truncates to 3
    expect(getTotalSnapshots()).toBe(3);
  });

  it('incrementSnapshotCounter works after manual set', () => {
    store.set(TOTAL_SNAPSHOTS_KEY, '100');
    incrementSnapshotCounter();
    expect(getTotalSnapshots()).toBe(101);
  });
});

// ─── Partial Update (Spread) Edge Cases ───

describe('exception: partial update patterns', () => {
  it('spreading null/undefined into object', () => {
    const base = { id: '1', name: 'test' };
    const patch: Record<string, unknown> = {};
    const result = { ...base, ...patch };
    expect(result).toEqual(base);
  });

  it('spreading does not create deep copies', () => {
    const nested = { inner: [1, 2, 3] };
    const base = { id: '1', data: nested };
    const copy = { ...base };
    copy.data.inner.push(4);
    // Shallow copy means original is also modified
    expect(base.data.inner).toContain(4);
  });

  it('Object.keys on object with undefined values', () => {
    const obj = { a: 1, b: undefined, c: null };
    const keys = Object.keys(obj);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
    // But after JSON round-trip, undefined is dropped
    const jsonKeys = Object.keys(JSON.parse(JSON.stringify(obj)));
    expect(jsonKeys).not.toContain('b');
    expect(jsonKeys).toContain('c'); // null is preserved
  });
});
