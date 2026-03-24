/**
 * storage-integrity.test.ts — Storage boundary, data integrity, and edge case tests
 *
 * Covers:
 * - localStorage quota exceeded → IndexedDB fallback
 * - Corrupted/invalid JSON recovery
 * - Concurrent access (storage events)
 * - Data migration (legacy sourceText → sourceReference)
 * - Project ↔ Log relationships
 * - TODO state transitions (pending → done → trash/archive → delete)
 * - Log deletion cascade cleanup
 * - Export → Import round-trip
 * - Date/timezone handling
 * - Unicode/emoji preservation
 * - Empty/null/undefined edge cases
 * - Large data (1MB+ logs)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ───
const store = new Map<string, string>();
let quotaExceeded = false;

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (quotaExceeded) {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
      Object.defineProperty(err, 'name', { value: 'QuotaExceededError' });
      throw err;
    }
    store.set(k, v);
  },
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

// Mock indexedDb module so we can verify fallback behavior
const idbStore = new Map<string, unknown>();
vi.mock('../storage/indexedDb', () => ({
  saveToIdb: vi.fn(async (key: string, data: unknown) => { idbStore.set(key, data); }),
  loadFromIdb: vi.fn(async (key: string) => idbStore.get(key) ?? null),
}));

import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  invalidateLogsCache,
  invalidateProjectsCache,
  invalidateTodosCache,
  invalidateMasterNotesCache,
  addLog,
  loadLogs,
  getLog,
  updateLog,
  trashLog,
  restoreLog,
  deleteLog,
  duplicateLog,
  addProject,
  loadProjects,
  trashProject,
  deleteProject,
  updateProject,
  addTodosFromLog,
  addTodosFromLogWithMeta,
  addManualTodo,
  loadTodos,
  loadTrashedTodos,
  loadArchivedTodos,
  updateTodo,
  trashTodo,
  restoreTodo,
  deleteTodo,
  archiveTodo,
  unarchiveTodo,
  deleteTodosForLog,
  exportAllData,
  validateBackup,
  importData,
  saveMasterNote,
  getMasterNote,
  purgeExpiredTrash,
} from '../storage';
import { loadWithIdbFallback } from '../storage/core';
import { saveToIdb } from '../storage/indexedDb';
import type { LogEntry, Todo, MasterNote } from '../types';

// ─── Helpers ───

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

function invalidateAll(): void {
  invalidateLogsCache();
  invalidateProjectsCache();
  invalidateTodosCache();
  invalidateMasterNotesCache();
}

// ════════════════════════════════════════════════════════════════
// 1. STORAGE BOUNDARY TESTS
// ════════════════════════════════════════════════════════════════

describe('storage boundary — quota exceeded / IndexedDB fallback', () => {
  beforeEach(() => {
    store.clear();
    idbStore.clear();
    quotaExceeded = false;
    invalidateAll();
    vi.clearAllMocks();
  });

  it('safeSetItem falls back to IndexedDB when quota is exceeded', () => {
    quotaExceeded = true;
    // Should not throw
    expect(() => safeSetItem('big_key', 'big_value')).not.toThrow();
    // Should have called saveToIdb
    expect(saveToIdb).toHaveBeenCalledWith('big_key', 'big_value');
  });

  it('safeSetItem dispatches lore-storage-full event on quota exceeded', () => {
    // window is available in the safeSetItem code path via typeof check
    const mockWindow = { dispatchEvent: vi.fn() };
    vi.stubGlobal('window', mockWindow);
    quotaExceeded = true;
    safeSetItem('key', 'val');
    expect(mockWindow.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = mockWindow.dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('lore-storage-full');
    vi.unstubAllGlobals();
    // Re-stub localStorage after unstubbing all
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (quotaExceeded) {
          const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
          Object.defineProperty(err, 'name', { value: 'QuotaExceededError' });
          throw err;
        }
        store.set(k, v);
      },
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
  });

  it('safeGetItem returns null when localStorage throws', () => {
    const origGetItem = localStorage.getItem;
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('Access denied'); });
    expect(safeGetItem('any')).toBeNull();
    vi.mocked(localStorage.getItem).mockImplementation(origGetItem);
  });

  it('loadWithIdbFallback returns localStorage value when available', async () => {
    store.set('test_key', 'local_value');
    const result = await loadWithIdbFallback('test_key');
    expect(result).toBe('local_value');
  });

  it('loadWithIdbFallback falls back to IndexedDB when localStorage is empty', async () => {
    idbStore.set('test_key', 'idb_value');
    const result = await loadWithIdbFallback('test_key');
    expect(result).toBe('idb_value');
  });

  it('loadWithIdbFallback returns null when both sources are empty', async () => {
    const result = await loadWithIdbFallback('nonexistent');
    expect(result).toBeNull();
  });
});

describe('storage boundary — corrupted data recovery', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('loadLogs returns empty array for invalid JSON in localStorage', () => {
    store.set('threadlog_logs', '{{not valid json');
    invalidateLogsCache();
    expect(loadLogs()).toEqual([]);
  });

  it('loadLogs returns empty array for non-array JSON', () => {
    store.set('threadlog_logs', '{"not": "an array"}');
    invalidateLogsCache();
    expect(loadLogs()).toEqual([]);
  });

  it('loadTodos returns empty array for corrupted data', () => {
    store.set('threadlog_todos', 'garbage data!!!');
    invalidateTodosCache();
    expect(loadTodos()).toEqual([]);
  });

  it('loadProjects returns empty array for corrupted data', () => {
    store.set('threadlog_projects', '<xml>not json</xml>');
    invalidateProjectsCache();
    expect(loadProjects()).toEqual([]);
  });

  it('loadLogs handles partially valid data gracefully', () => {
    store.set('threadlog_logs', JSON.stringify([
      { id: 'valid', title: 'OK', createdAt: '2025-01-01T00:00:00Z', tags: [], today: [], decisions: [], todo: [], relatedProjects: [] },
    ]));
    invalidateLogsCache();
    const logs = loadLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].title).toBe('OK');
  });

  it('exportAllData handles corrupted single key gracefully', () => {
    store.set('threadlog_logs', 'not json');
    store.set('threadlog_projects', JSON.stringify([{ id: 'p1', name: 'P' }]));
    invalidateAll();
    const backup = exportAllData();
    // logs should be empty (safeJsonParse returns [])
    expect(backup.data['threadlog_logs'] || []).toEqual([]);
    expect(backup.data['threadlog_projects']).toHaveLength(1);
  });

  it('validateBackup rejects null, undefined, strings, numbers', () => {
    expect(validateBackup(null)).toBe(false);
    expect(validateBackup(undefined)).toBe(false);
    expect(validateBackup('string')).toBe(false);
    expect(validateBackup(42)).toBe(false);
    expect(validateBackup([])).toBe(false);
  });

  it('validateBackup rejects missing version or data', () => {
    expect(validateBackup({ data: {} })).toBe(false);
    expect(validateBackup({ version: 1 })).toBe(false);
  });
});

describe('storage boundary — migration (sourceText → sourceReference)', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('auto-migrates logs with sourceText on first load', () => {
    const legacyLog = {
      id: 'legacy1',
      title: 'Old Log',
      createdAt: '2024-01-01T00:00:00Z',
      sourceText: 'This is the original conversation text that is very long...',
      tags: [],
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
    };
    store.set('threadlog_logs', JSON.stringify([legacyLog]));
    // No migration key yet
    store.delete('threadlog_migration_v2');
    invalidateLogsCache();

    const logs = loadLogs();
    expect(logs).toHaveLength(1);
    // sourceText should be stripped
    expect(logs[0].sourceText).toBeUndefined();
    // sourceReference should be created
    expect(logs[0].sourceReference).toBeDefined();
    expect(logs[0].sourceReference!.charCount).toBe(legacyLog.sourceText.length);
    expect(logs[0].sourceReference!.sourceType).toBe('unknown');
    // Migration key should be set
    expect(store.get('threadlog_migration_v2')).toBe('1');
  });

  it('does not re-migrate if migration key exists', () => {
    const logWithSourceText = {
      id: 'keep-source',
      title: 'Keep',
      createdAt: '2024-01-01T00:00:00Z',
      sourceText: 'Should not be stripped',
      tags: [], today: [], decisions: [], todo: [], relatedProjects: [],
    };
    store.set('threadlog_logs', JSON.stringify([logWithSourceText]));
    store.set('threadlog_migration_v2', '1');
    invalidateLogsCache();

    const logs = loadLogs();
    // sourceText remains because migration already ran
    expect(logs[0].sourceText).toBe('Should not be stripped');
  });
});

// ════════════════════════════════════════════════════════════════
// 2. DATA INTEGRITY TESTS
// ════════════════════════════════════════════════════════════════

describe('data integrity — project ↔ log relationships', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('log can be assigned to a project via projectId', () => {
    const project = addProject('My Project');
    const log = makeLog({ title: 'Project Log', projectId: project.id });
    addLog(log);

    const loaded = getLog(log.id);
    expect(loaded!.projectId).toBe(project.id);
  });

  it('deleting a project unassigns logs but keeps them', () => {
    const project = addProject('To Delete');
    const log = makeLog({ title: 'Orphan Log', projectId: project.id });
    addLog(log);

    deleteProject(project.id);

    expect(loadProjects()).toHaveLength(0);
    const orphan = getLog(log.id);
    expect(orphan).toBeDefined();
    expect(orphan!.projectId).toBeUndefined();
  });

  it('multiple logs can share the same projectId', () => {
    const project = addProject('Shared');
    const log1 = makeLog({ title: 'Log 1', projectId: project.id });
    const log2 = makeLog({ title: 'Log 2', projectId: project.id });
    addLog(log1);
    addLog(log2);

    const projectLogs = loadLogs().filter(l => l.projectId === project.id);
    expect(projectLogs).toHaveLength(2);
  });

  it('trashing a project does not affect associated logs', () => {
    const project = addProject('Trash Project');
    const log = makeLog({ projectId: project.id });
    addLog(log);
    trashProject(project.id);

    expect(loadLogs()).toHaveLength(1);
    expect(getLog(log.id)!.projectId).toBe(project.id);
  });
});

describe('data integrity — TODO state transitions', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('pending → done transition', () => {
    addManualTodo('Task');
    const id = loadTodos()[0].id;
    expect(loadTodos()[0].done).toBe(false);

    updateTodo(id, { done: true });
    expect(loadTodos()[0].done).toBe(true);
  });

  it('done → trash transition', () => {
    addManualTodo('Task');
    const id = loadTodos()[0].id;
    updateTodo(id, { done: true });
    trashTodo(id);

    expect(loadTodos()).toHaveLength(0);
    expect(loadTrashedTodos()).toHaveLength(1);
    expect(loadTrashedTodos()[0].done).toBe(true);
  });

  it('trash → restore → active (preserves done state)', () => {
    addManualTodo('Task');
    const id = loadTodos()[0].id;
    updateTodo(id, { done: true });
    trashTodo(id);
    restoreTodo(id);

    expect(loadTodos()).toHaveLength(1);
    expect(loadTodos()[0].done).toBe(true);
    expect(loadTrashedTodos()).toHaveLength(0);
  });

  it('pending → done → archive transition', () => {
    addManualTodo('Archive me');
    const id = loadTodos()[0].id;
    updateTodo(id, { done: true });
    archiveTodo(id);

    expect(loadTodos()).toHaveLength(0);
    expect(loadArchivedTodos()).toHaveLength(1);
  });

  it('archive → unarchive restores to active', () => {
    addManualTodo('Cycle');
    const id = loadTodos()[0].id;
    archiveTodo(id);
    unarchiveTodo(id);

    expect(loadTodos()).toHaveLength(1);
    expect(loadArchivedTodos()).toHaveLength(0);
  });

  it('permanent delete removes completely', () => {
    addManualTodo('Gone');
    const id = loadTodos()[0].id;
    trashTodo(id);
    deleteTodo(id);

    expect(loadTodos()).toHaveLength(0);
    expect(loadTrashedTodos()).toHaveLength(0);
  });

  it('todo linked to log via logId', () => {
    const log = makeLog({ todo: ['Fix bug', 'Write test'] });
    addLog(log);
    addTodosFromLog(log.id, log.todo);

    const todos = loadTodos();
    expect(todos).toHaveLength(2);
    expect(todos.every(t => t.logId === log.id)).toBe(true);
  });

  it('addTodosFromLogWithMeta preserves priority and dueDate', () => {
    addTodosFromLogWithMeta('log1', [
      { title: 'Urgent', priority: 'high', dueDate: '2025-12-25' },
      { title: 'Normal' },
    ]);
    const todos = loadTodos();
    const urgent = todos.find(t => t.text === 'Urgent');
    const normal = todos.find(t => t.text === 'Normal');
    expect(urgent!.priority).toBe('high');
    expect(urgent!.dueDate).toBe('2025-12-25');
    expect(normal!.priority).toBeUndefined();
    expect(normal!.dueDate).toBeUndefined();
  });
});

describe('data integrity — log deletion cascade cleanup', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('deleteLog removes associated TODOs', () => {
    const log = makeLog();
    addLog(log);
    addTodosFromLog(log.id, ['Todo 1', 'Todo 2']);
    expect(loadTodos()).toHaveLength(2);

    deleteLog(log.id);
    expect(loadTodos()).toHaveLength(0);
  });

  it('deleteLog cleans MasterNote sourceLogIds', () => {
    const project = addProject('Project');
    const log = makeLog({ projectId: project.id });
    addLog(log);

    const masterNote: MasterNote = {
      id: crypto.randomUUID(),
      projectId: project.id,
      overview: 'Overview',
      currentStatus: 'Status',
      decisions: [{ text: 'Decision 1', sourceLogIds: [log.id] }],
      openIssues: [{ text: 'Issue 1', sourceLogIds: [log.id, 'other-log'] }],
      nextActions: [],
      relatedLogIds: [log.id],
      updatedAt: Date.now(),
    };
    saveMasterNote(masterNote);

    deleteLog(log.id);

    const mn = getMasterNote(project.id);
    expect(mn).toBeDefined();
    expect(mn!.relatedLogIds).not.toContain(log.id);
    expect(mn!.decisions[0].sourceLogIds).not.toContain(log.id);
    expect(mn!.openIssues[0].sourceLogIds).toContain('other-log');
    expect(mn!.openIssues[0].sourceLogIds).not.toContain(log.id);
  });

  it('deleteLog does not affect unrelated TODOs', () => {
    const log1 = makeLog();
    const log2 = makeLog();
    addLog(log1);
    addLog(log2);
    addTodosFromLog(log1.id, ['Log1 Todo']);
    addTodosFromLog(log2.id, ['Log2 Todo']);
    addManualTodo('Manual Todo');

    deleteLog(log1.id);

    const remaining = loadTodos();
    expect(remaining).toHaveLength(2);
    expect(remaining.some(t => t.text === 'Log2 Todo')).toBe(true);
    expect(remaining.some(t => t.text === 'Manual Todo')).toBe(true);
  });

  it('trashLog does not cascade-delete TODOs (only permanent delete does)', () => {
    const log = makeLog();
    addLog(log);
    addTodosFromLog(log.id, ['Keep me']);

    trashLog(log.id);
    expect(loadTodos()).toHaveLength(1);
  });
});

describe('data integrity — export/import round-trip', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('export → import (overwrite) preserves all data', () => {
    // Set up data
    const project = addProject('Round Trip Project');
    const log = makeLog({ title: 'Round Trip Log', projectId: project.id });
    addLog(log);
    addTodosFromLog(log.id, ['Todo 1', 'Todo 2']);
    addManualTodo('Manual');

    // Export
    const backup = exportAllData();
    expect(validateBackup(backup)).toBe(true);

    // Clear everything
    store.clear();
    invalidateAll();
    expect(loadLogs()).toHaveLength(0);
    expect(loadProjects()).toHaveLength(0);
    expect(loadTodos()).toHaveLength(0);

    // Import
    const result = importData(backup, 'overwrite');
    expect(result.logs).toBe(1);
    expect(result.projects).toBe(1);
    expect(result.todos).toBe(3);

    // Verify data
    const logs = loadLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].title).toBe('Round Trip Log');
    expect(logs[0].projectId).toBe(project.id);

    const projects = loadProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Round Trip Project');

    const todos = loadTodos();
    expect(todos).toHaveLength(3);
  });

  it('export → import (merge) combines data', () => {
    // Existing data
    const existingLog = makeLog({ title: 'Existing' });
    addLog(existingLog);

    // Create backup with different data
    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      data: {
        threadlog_logs: [
          { id: 'imported-log', title: 'Imported', createdAt: '2025-01-01T00:00:00Z', tags: [], today: [], decisions: [], todo: [], relatedProjects: [] },
        ],
      },
    };

    const result = importData(backup, 'merge');
    expect(result.logs).toBe(2); // existing + imported
  });

  it('export → import (merge) incoming wins on ID conflict', () => {
    const log = makeLog({ title: 'Original' });
    addLog(log);

    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      data: {
        threadlog_logs: [
          { id: log.id, title: 'Updated Version', createdAt: log.createdAt, tags: [], today: [], decisions: [], todo: [], relatedProjects: [] },
        ],
      },
    };

    importData(backup, 'merge');
    invalidateLogsCache();
    const raw = JSON.parse(store.get('threadlog_logs')!);
    const imported = raw.find((l: LogEntry) => l.id === log.id);
    expect(imported.title).toBe('Updated Version');
  });

  it('empty export → import does nothing', () => {
    addManualTodo('Keep');
    const emptyBackup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      data: {},
    };

    importData(emptyBackup, 'overwrite');
    // Todos not in backup → not overwritten (only keys in DATA_KEYS are touched)
    expect(loadTodos()).toHaveLength(1);
  });

  it('round-trip preserves Unicode and emoji in log titles', () => {
    const log = makeLog({ title: '日本語テスト 🎉🔥 café résumé' });
    addLog(log);

    const backup = exportAllData();
    store.clear();
    invalidateAll();

    importData(backup, 'overwrite');
    const restored = loadLogs();
    expect(restored[0].title).toBe('日本語テスト 🎉🔥 café résumé');
  });
});

describe('data integrity — purgeExpiredTrash cascades', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('purgeExpiredTrash removes logs trashed over 30 days ago', () => {
    const oldLog = makeLog({ trashedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 });
    const recentLog = makeLog({ trashedAt: Date.now() - 1 * 24 * 60 * 60 * 1000 });
    addLog(oldLog);
    addLog(recentLog);
    // Manually set trashedAt since addLog doesn't trash
    updateLog(oldLog.id, { trashedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 } as Partial<LogEntry>);
    updateLog(recentLog.id, { trashedAt: Date.now() - 1 * 24 * 60 * 60 * 1000 } as Partial<LogEntry>);

    purgeExpiredTrash();
    invalidateLogsCache();

    // Old log purged, recent log kept
    const raw = store.get('threadlog_logs');
    const logs: LogEntry[] = raw ? JSON.parse(raw) : [];
    expect(logs.find(l => l.id === oldLog.id)).toBeUndefined();
    expect(logs.find(l => l.id === recentLog.id)).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════
// 3. EDGE CASES
// ════════════════════════════════════════════════════════════════

describe('edge cases — date/timezone handling', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('logs with ISO dates sort correctly regardless of timezone offset', () => {
    const log1 = makeLog({ title: 'UTC+9', createdAt: '2025-06-01T09:00:00+09:00' });
    const log2 = makeLog({ title: 'UTC', createdAt: '2025-06-01T00:00:00Z' });
    const log3 = makeLog({ title: 'UTC-5', createdAt: '2025-06-01T05:00:00-05:00' });
    // All represent the same instant: 2025-06-01T00:00:00Z

    addLog(log1);
    addLog(log2);
    addLog(log3);

    const logs = loadLogs();
    // UTC-5 05:00 = UTC 10:00 (latest), UTC+9 09:00 = UTC 00:00 (earliest)
    expect(logs[0].title).toBe('UTC-5');
    expect(logs[2].title).toBe('UTC+9');
  });

  it('createdAt with milliseconds is preserved', () => {
    const precise = '2025-03-15T10:30:45.123Z';
    const log = makeLog({ createdAt: precise });
    addLog(log);
    expect(getLog(log.id)!.createdAt).toBe(precise);
  });

  it('todo dueDate uses YYYY-MM-DD format consistently', () => {
    addManualTodo('Due task', { dueDate: '2025-12-31' });
    const todo = loadTodos()[0];
    expect(todo.dueDate).toBe('2025-12-31');
    expect(todo.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('edge cases — Unicode/emoji preservation', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('log title with emoji is preserved', () => {
    const log = makeLog({ title: '🚀 Launch Day 🎉' });
    addLog(log);
    expect(getLog(log.id)!.title).toBe('🚀 Launch Day 🎉');
  });

  it('log with CJK characters is preserved', () => {
    const log = makeLog({
      title: '日本語テスト',
      tags: ['開発', '设计', '디자인'],
      today: ['プロジェクト管理を実施'],
      decisions: ['中文决定'],
    });
    addLog(log);
    const loaded = getLog(log.id)!;
    expect(loaded.title).toBe('日本語テスト');
    expect(loaded.tags).toEqual(['開発', '设计', '디자인']);
    expect(loaded.today).toEqual(['プロジェクト管理を実施']);
    expect(loaded.decisions).toEqual(['中文决定']);
  });

  it('project with emoji icon is preserved', () => {
    const project = addProject('Emoji Project');
    updateProject(project.id, { icon: '🔧', color: 'blue' });
    const loaded = loadProjects()[0];
    expect(loaded.icon).toBe('🔧');
  });

  it('todo with mixed scripts is preserved', () => {
    addManualTodo('Fix バグ in 컴포넌트 for 组件 🐛');
    const todo = loadTodos()[0];
    expect(todo.text).toBe('Fix バグ in 컴포넌트 for 组件 🐛');
  });

  it('surrogate pairs (complex emoji) are preserved', () => {
    const complexEmoji = '👨‍👩‍👧‍👦 🏳️‍🌈 🇯🇵';
    const log = makeLog({ title: complexEmoji });
    addLog(log);
    expect(getLog(log.id)!.title).toBe(complexEmoji);
  });
});

describe('edge cases — empty/null/undefined handling', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('log with empty string title is saved', () => {
    const log = makeLog({ title: '' });
    addLog(log);
    expect(getLog(log.id)!.title).toBe('');
  });

  it('log with empty arrays is saved', () => {
    const log = makeLog({ tags: [], today: [], decisions: [], todo: [] });
    addLog(log);
    const loaded = getLog(log.id)!;
    expect(loaded.tags).toEqual([]);
    expect(loaded.today).toEqual([]);
    expect(loaded.decisions).toEqual([]);
    expect(loaded.todo).toEqual([]);
  });

  it('updateLog with empty patch does not corrupt data', () => {
    const log = makeLog({ title: 'Keep Me' });
    addLog(log);
    updateLog(log.id, {});
    expect(getLog(log.id)!.title).toBe('Keep Me');
  });

  it('addTodosFromLog with empty items does nothing', () => {
    addTodosFromLog('log1', []);
    expect(loadTodos()).toHaveLength(0);
  });

  it('getLog with empty string ID returns undefined', () => {
    expect(getLog('')).toBeUndefined();
  });

  it('deleteLog with nonexistent ID does not throw', () => {
    expect(() => deleteLog('nonexistent')).not.toThrow();
  });

  it('trashLog with nonexistent ID does not throw', () => {
    expect(() => trashLog('nonexistent')).not.toThrow();
  });

  it('restoreLog with nonexistent ID does not throw', () => {
    expect(() => restoreLog('nonexistent')).not.toThrow();
  });

  it('safeSetItem with empty string value', () => {
    safeSetItem('empty_val', '');
    expect(safeGetItem('empty_val')).toBe('');
  });

  it('safeRemoveItem on nonexistent key does not throw', () => {
    expect(() => safeRemoveItem('never_set')).not.toThrow();
  });

  it('duplicateLog with nonexistent ID returns null', () => {
    expect(duplicateLog('nonexistent', ' copy')).toBeNull();
  });

  it('todo with empty text is saved', () => {
    addManualTodo('');
    expect(loadTodos()).toHaveLength(1);
    expect(loadTodos()[0].text).toBe('');
  });

  it('loadLogs from empty store returns empty array', () => {
    expect(loadLogs()).toEqual([]);
  });

  it('loadTodos from empty store returns empty array', () => {
    expect(loadTodos()).toEqual([]);
  });

  it('loadProjects from empty store returns empty array', () => {
    expect(loadProjects()).toEqual([]);
  });

  it('exportAllData from empty store returns empty data', () => {
    const backup = exportAllData();
    expect(Object.keys(backup.data)).toHaveLength(0);
  });
});

describe('edge cases — large data (1MB+)', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('stores and retrieves a log with 1MB+ content in today field', () => {
    const largeText = 'x'.repeat(1024 * 1024); // 1MB
    const log = makeLog({ today: [largeText] });
    addLog(log);

    const loaded = getLog(log.id);
    expect(loaded).toBeDefined();
    expect(loaded!.today[0].length).toBe(1024 * 1024);
    expect(loaded!.today[0]).toBe(largeText);
  });

  it('stores and retrieves many logs (100+)', () => {
    for (let i = 0; i < 100; i++) {
      addLog(makeLog({ title: `Log ${i}`, createdAt: new Date(2025, 0, 1, 0, 0, i).toISOString() }));
    }
    const logs = loadLogs();
    expect(logs).toHaveLength(100);
    // Should be sorted newest first
    expect(logs[0].title).toBe('Log 99');
    expect(logs[99].title).toBe('Log 0');
  });

  it('many todos (500+) are handled', () => {
    const items = Array.from({ length: 500 }, (_, i) => `Todo ${i}`);
    addTodosFromLog('big-log', items);
    expect(loadTodos()).toHaveLength(500);
  });

  it('duplicateLog works for log with large data', () => {
    const bigLog = makeLog({
      title: 'Big',
      today: Array.from({ length: 100 }, (_, i) => `Item ${i} ${'data'.repeat(100)}`),
      tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
    });
    addLog(bigLog);
    const newId = duplicateLog(bigLog.id, ' (copy)');
    expect(newId).toBeTruthy();
    const dup = getLog(newId!);
    expect(dup!.today).toHaveLength(100);
    expect(dup!.tags).toHaveLength(50);
  });
});

describe('edge cases — concurrent-like access patterns', () => {
  beforeEach(() => {
    store.clear();
    quotaExceeded = false;
    invalidateAll();
  });

  it('rapid sequential writes do not lose data', () => {
    for (let i = 0; i < 20; i++) {
      addManualTodo(`Rapid ${i}`);
    }
    expect(loadTodos()).toHaveLength(20);
  });

  it('interleaved log and todo operations maintain consistency', () => {
    const log1 = makeLog({ title: 'Log 1' });
    addLog(log1);
    addTodosFromLog(log1.id, ['T1']);

    const log2 = makeLog({ title: 'Log 2' });
    addLog(log2);
    addTodosFromLog(log2.id, ['T2']);

    updateTodo(loadTodos().find(t => t.text === 'T1')!.id, { done: true });

    expect(loadLogs()).toHaveLength(2);
    expect(loadTodos()).toHaveLength(2);
    expect(loadTodos().find(t => t.text === 'T1')!.done).toBe(true);
    expect(loadTodos().find(t => t.text === 'T2')!.done).toBe(false);
  });

  it('cache invalidation ensures fresh reads after direct store mutation', () => {
    addLog(makeLog({ title: 'Original' }));
    // First read populates the cache
    const first = loadLogs();
    expect(first[0].title).toBe('Original');

    // Simulate another tab writing directly to localStorage (bypassing saveLogs)
    const logs = JSON.parse(store.get('threadlog_logs')!);
    logs[0].title = 'Modified by other tab';
    store.set('threadlog_logs', JSON.stringify(logs));

    // The cache was already populated by the first loadLogs call above,
    // but saveLogs (called by addLog) also invalidates the cache.
    // So let's re-read to populate cache, then mutate store again.
    const cached = loadLogs();
    // Now mutate store directly (bypassing saveLogs)
    const logs2 = JSON.parse(store.get('threadlog_logs')!);
    logs2[0].title = 'Sneaky update';
    store.set('threadlog_logs', JSON.stringify(logs2));

    // Without explicit invalidation, cache may still return old data
    // (depends on cache version matching). Force-invalidate to prove fresh read:
    invalidateLogsCache();
    const fresh = loadLogs();
    expect(fresh[0].title).toBe('Sneaky update');
    // Verify the cached read before invalidation was different
    expect(cached[0].title).not.toBe('Sneaky update');
  });

  it('storage event from another tab can be simulated via cache invalidation', () => {
    addManualTodo('Tab 1 todo');
    // Simulate tab 2 adding a todo
    const raw = JSON.parse(store.get('threadlog_todos')!);
    raw.push({ id: 'tab2-todo', text: 'Tab 2 todo', done: false, logId: '', createdAt: Date.now() });
    store.set('threadlog_todos', JSON.stringify(raw));
    invalidateTodosCache();

    expect(loadTodos()).toHaveLength(2);
    expect(loadTodos().some(t => t.text === 'Tab 2 todo')).toBe(true);
  });
});
