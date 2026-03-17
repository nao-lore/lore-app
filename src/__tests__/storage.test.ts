/**
 * storage.test.ts — Unit tests for storage CRUD + cache invalidation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing storage module
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

// Stub import.meta.env.DEV
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

import {
  addLog,
  loadLogs,
  getLog,
  updateLog,
  trashLog,
  restoreLog,
  invalidateLogsCache,
} from '../storage';
import type { LogEntry } from '../types';

function makeLog(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    title: 'Test Log',
    createdAt: new Date().toISOString(),
    tags: [],
    today: [],
    decisions: [],
    todo: [],
    outputMode: 'handoff',
    relatedProjects: [],
    ...overrides,
  } as LogEntry;
}

describe('storage — logs CRUD + cache', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
  });

  it('addLog creates a log and it is retrievable', () => {
    const log = makeLog({ title: 'My First Log' });
    addLog(log);

    const retrieved = getLog(log.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('My First Log');
    expect(retrieved!.id).toBe(log.id);

    const allLogs = loadLogs();
    expect(allLogs.some((l) => l.id === log.id)).toBe(true);
  });

  it('updateLog modifies fields', () => {
    const log = makeLog({ title: 'Original' });
    addLog(log);

    updateLog(log.id, { title: 'Updated Title', tags: ['new-tag'] });

    const updated = getLog(log.id);
    expect(updated).toBeDefined();
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.tags).toEqual(['new-tag']);
  });

  it('trashLog moves to trash', () => {
    const log = makeLog();
    addLog(log);

    trashLog(log.id);

    // Should not appear in active logs
    const activeLogs = loadLogs();
    expect(activeLogs.some((l) => l.id === log.id)).toBe(false);

    // Should still be retrievable via getLog (which includes trashed)
    const trashed = getLog(log.id);
    expect(trashed).toBeDefined();
    expect(trashed!.trashedAt).toBeDefined();
    expect(typeof trashed!.trashedAt).toBe('number');
  });

  it('restoreLog restores from trash', () => {
    const log = makeLog();
    addLog(log);
    trashLog(log.id);

    // Verify it's trashed
    expect(loadLogs().some((l) => l.id === log.id)).toBe(false);

    restoreLog(log.id);

    // Should be back in active logs
    const activeLogs = loadLogs();
    expect(activeLogs.some((l) => l.id === log.id)).toBe(true);

    const restored = getLog(log.id);
    expect(restored).toBeDefined();
    expect(restored!.trashedAt).toBeUndefined();
  });

  it('cache invalidation works (add then load shows new data)', () => {
    const log1 = makeLog({ title: 'Log 1' });
    addLog(log1);

    // First load populates cache
    const first = loadLogs();
    expect(first).toHaveLength(1);

    // Adding another log invalidates cache internally
    const log2 = makeLog({ title: 'Log 2' });
    addLog(log2);

    // Second load should reflect the new log
    const second = loadLogs();
    expect(second).toHaveLength(2);
    expect(second.some((l) => l.id === log2.id)).toBe(true);
  });
});
