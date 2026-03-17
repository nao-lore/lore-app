/**
 * storage-core.test.ts — Unit tests for core storage utilities
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  invalidateLogsCache,
  invalidateProjectsCache,
  invalidateTodosCache,
  invalidateMasterNotesCache,
} from '../storage/core';
import { cache } from '../storage/core';

describe('storage/core — safeGetItem / safeSetItem / safeRemoveItem', () => {
  beforeEach(() => {
    store.clear();
  });

  it('safeGetItem returns null for missing key', () => {
    expect(safeGetItem('nonexistent')).toBeNull();
  });

  it('safeSetItem writes and safeGetItem reads', () => {
    safeSetItem('test_key', 'hello');
    expect(safeGetItem('test_key')).toBe('hello');
  });

  it('safeSetItem overwrites existing value', () => {
    safeSetItem('key', 'v1');
    safeSetItem('key', 'v2');
    expect(safeGetItem('key')).toBe('v2');
  });

  it('safeRemoveItem deletes key', () => {
    safeSetItem('key', 'val');
    safeRemoveItem('key');
    expect(safeGetItem('key')).toBeNull();
  });

  it('safeRemoveItem on nonexistent key does not throw', () => {
    expect(() => safeRemoveItem('nope')).not.toThrow();
  });

  it('safeGetItem handles empty string value', () => {
    safeSetItem('empty', '');
    expect(safeGetItem('empty')).toBe('');
  });

  it('safeSetItem handles large value', () => {
    const large = 'x'.repeat(10000);
    safeSetItem('big', large);
    expect(safeGetItem('big')).toBe(large);
  });

  it('safeSetItem handles special characters', () => {
    const val = '{"key":"日本語テスト","emoji":"🎉"}';
    safeSetItem('special', val);
    expect(safeGetItem('special')).toBe(val);
  });

  it('safeSetItem handles JSON values', () => {
    const obj = { a: 1, b: [2, 3] };
    safeSetItem('json', JSON.stringify(obj));
    expect(JSON.parse(safeGetItem('json')!)).toEqual(obj);
  });

  it('multiple keys are independent', () => {
    safeSetItem('a', '1');
    safeSetItem('b', '2');
    safeRemoveItem('a');
    expect(safeGetItem('a')).toBeNull();
    expect(safeGetItem('b')).toBe('2');
  });
});

describe('storage/core — cache invalidation', () => {
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

  it('invalidateLogsCache increments version and nullifies data', () => {
    cache.logsCache.data = [] as never;
    invalidateLogsCache();
    expect(cache.logsCacheVersion).toBe(1);
    expect(cache.logsCache.data).toBeNull();
  });

  it('invalidateProjectsCache increments version', () => {
    invalidateProjectsCache();
    expect(cache.projectsCacheVersion).toBe(1);
    expect(cache.projectsCache.data).toBeNull();
  });

  it('invalidateTodosCache increments version', () => {
    invalidateTodosCache();
    expect(cache.todosCacheVersion).toBe(1);
    expect(cache.todosCache.data).toBeNull();
  });

  it('invalidateMasterNotesCache increments version', () => {
    invalidateMasterNotesCache();
    expect(cache.masterNotesCacheVersion).toBe(1);
    expect(cache.masterNotesCache.data).toBeNull();
  });

  it('multiple invalidations keep incrementing', () => {
    invalidateLogsCache();
    invalidateLogsCache();
    invalidateLogsCache();
    expect(cache.logsCacheVersion).toBe(3);
  });
});
