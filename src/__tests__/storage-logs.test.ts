/**
 * storage-logs.test.ts — Unit tests for logs storage module
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
  addLog,
  loadLogs,
  getLog,
  updateLog,
  trashLog,
  restoreLog,
  duplicateLog,
  linkLogs,
  unlinkLogs,
  loadTrashedLogs,
  deleteLog,
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

describe('storage/logs — CRUD operations', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
  });

  it('addLog and getLog round-trip', () => {
    const log = makeLog({ title: 'Round Trip' });
    addLog(log);
    const got = getLog(log.id);
    expect(got).toBeDefined();
    expect(got!.title).toBe('Round Trip');
  });

  it('loadLogs returns all active logs', () => {
    addLog(makeLog({ title: 'A' }));
    addLog(makeLog({ title: 'B' }));
    expect(loadLogs()).toHaveLength(2);
  });

  it('loadLogs excludes trashed logs', () => {
    const log = makeLog();
    addLog(log);
    trashLog(log.id);
    expect(loadLogs()).toHaveLength(0);
  });

  it('loadTrashedLogs returns only trashed', () => {
    const log = makeLog();
    addLog(log);
    trashLog(log.id);
    expect(loadTrashedLogs()).toHaveLength(1);
    expect(loadTrashedLogs()[0].id).toBe(log.id);
  });

  it('updateLog modifies specific fields', () => {
    const log = makeLog({ title: 'Old' });
    addLog(log);
    updateLog(log.id, { title: 'New', tags: ['updated'] });
    const updated = getLog(log.id);
    expect(updated!.title).toBe('New');
    expect(updated!.tags).toEqual(['updated']);
  });

  it('updateLog preserves unmodified fields', () => {
    const log = makeLog({ title: 'Keep', tags: ['original'] });
    addLog(log);
    updateLog(log.id, { title: 'Changed' });
    const updated = getLog(log.id);
    expect(updated!.tags).toEqual(['original']);
  });

  it('trashLog sets trashedAt and clears pinned', () => {
    const log = makeLog({ pinned: true });
    addLog(log);
    trashLog(log.id);
    const trashed = getLog(log.id);
    expect(trashed!.trashedAt).toBeDefined();
    expect(trashed!.pinned).toBe(false);
  });

  it('restoreLog removes trashedAt', () => {
    const log = makeLog();
    addLog(log);
    trashLog(log.id);
    restoreLog(log.id);
    const restored = getLog(log.id);
    expect(restored!.trashedAt).toBeUndefined();
    expect(loadLogs().some((l) => l.id === log.id)).toBe(true);
  });

  it('deleteLog permanently removes', () => {
    const log = makeLog();
    addLog(log);
    deleteLog(log.id);
    expect(getLog(log.id)).toBeUndefined();
    expect(loadLogs()).toHaveLength(0);
  });

  it('getLog returns undefined for nonexistent id', () => {
    expect(getLog('no-such-id')).toBeUndefined();
  });

  it('duplicateLog creates a copy with new id and title', () => {
    const log = makeLog({ title: 'Original' });
    addLog(log);
    const newId = duplicateLog(log.id, ' (copy)');
    expect(newId).toBeTruthy();
    const dup = getLog(newId!);
    expect(dup!.title).toBe('Original (copy)');
    expect(dup!.id).not.toBe(log.id);
  });

  it('duplicateLog returns null for nonexistent log', () => {
    expect(duplicateLog('missing', ' copy')).toBeNull();
  });

  it('duplicateLog does not carry over trashedAt or pinned', () => {
    const log = makeLog({ pinned: true });
    addLog(log);
    trashLog(log.id);
    const newId = duplicateLog(log.id, ' dup');
    const dup = getLog(newId!);
    expect(dup!.trashedAt).toBeUndefined();
    expect(dup!.pinned).toBeUndefined();
  });

  it('logs are sorted newest first', () => {
    const old = makeLog({ title: 'Old', createdAt: '2024-01-01T00:00:00Z' });
    const recent = makeLog({ title: 'New', createdAt: '2025-01-01T00:00:00Z' });
    addLog(old);
    addLog(recent);
    const logs = loadLogs();
    expect(logs[0].title).toBe('New');
    expect(logs[1].title).toBe('Old');
  });
});

describe('storage/logs — linking', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
  });

  it('linkLogs creates bidirectional links', () => {
    const a = makeLog({ title: 'A' });
    const b = makeLog({ title: 'B' });
    addLog(a);
    addLog(b);
    linkLogs(a.id, b.id);
    expect(getLog(a.id)!.relatedLogIds).toContain(b.id);
    expect(getLog(b.id)!.relatedLogIds).toContain(a.id);
  });

  it('linkLogs is idempotent (no duplicates)', () => {
    const a = makeLog();
    const b = makeLog();
    addLog(a);
    addLog(b);
    linkLogs(a.id, b.id);
    linkLogs(a.id, b.id);
    expect(getLog(a.id)!.relatedLogIds!.filter((id) => id === b.id)).toHaveLength(1);
  });

  it('unlinkLogs removes bidirectional links', () => {
    const a = makeLog();
    const b = makeLog();
    addLog(a);
    addLog(b);
    linkLogs(a.id, b.id);
    unlinkLogs(a.id, b.id);
    expect(getLog(a.id)!.relatedLogIds).not.toContain(b.id);
    expect(getLog(b.id)!.relatedLogIds).not.toContain(a.id);
  });
});
