import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { LogEntry, Project, MasterNote, Todo, WeeklyReport, KnowledgeBase } from './types';

// ─── localStorage mock ───
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

// ─── crypto.randomUUID mock ───
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// Keys used internally by storage.ts
const LOGS_KEY = 'threadlog_logs';
const PROJECTS_KEY = 'threadlog_projects';
const MASTER_NOTES_KEY = 'threadlog_master_notes';
const TODOS_KEY = 'threadlog_todos';
const MN_HISTORY_KEY = 'threadlog_mn_history';
const WEEKLY_REPORTS_KEY = 'threadlog_weekly_reports';
const KNOWLEDGE_BASE_KEY = 'threadlog_knowledge_bases';

// ─── Helpers ───

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: overrides.id ?? `log-${++uuidCounter}`,
    title: 'Test Log',
    createdAt: '2025-01-15T10:00:00.000Z',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? `proj-${++uuidCounter}`,
    name: 'Test Project',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeMasterNote(projectId: string, overrides: Partial<MasterNote> = {}): MasterNote {
  return {
    id: `mn-${++uuidCounter}`,
    projectId,
    overview: 'overview',
    currentStatus: 'status',
    decisions: [{ text: 'decision1', sourceLogIds: [] }],
    openIssues: [{ text: 'issue1', sourceLogIds: [] }],
    nextActions: [{ text: 'action1', sourceLogIds: [] }],
    relatedLogIds: [],
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: overrides.id ?? `todo-${++uuidCounter}`,
    text: 'Test Todo',
    done: false,
    logId: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeWeeklyReport(projectId: string, overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    id: overrides.id ?? `wr-${++uuidCounter}`,
    weekStart: '2025-01-13',
    weekEnd: '2025-01-19',
    projectId,
    summary: 'summary',
    achievements: [],
    decisions: [],
    openItems: [],
    completedTodos: [],
    pendingTodos: [],
    nextWeek: [],
    stats: { logCount: 0, worklogCount: 0, handoffCount: 0, todoCompletionRate: 0 },
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeKnowledgeBase(projectId: string): KnowledgeBase {
  return {
    id: `kb-${++uuidCounter}`,
    projectId,
    patterns: [],
    bestPractices: [],
    commonDecisions: [],
    generatedAt: Date.now(),
    logCount: 0,
  };
}

// Import storage functions (after mocks are set up)
import {
  loadLogs,
  addLog,
  updateLog,
  deleteLog,
  getLog,
  saveLogs,
  trashLog,
  restoreLog,
  loadTrashedLogs,
  duplicateLog,
  loadProjects,
  deleteProject,
  trashProject,
  restoreProject,
  loadTrashedProjects,
  loadMasterNotes,
  saveMasterNote,
  getMasterNote,
  getMasterNoteHistory,
  saveTodos,
  loadTodos,
  loadWeeklyReports,
  getKnowledgeBase,
  purgeExpiredTrash,
  exportAllData,
  importData,
  validateBackup,
  invalidateLogsCache,
  type LoreBackup,
} from './storage';

beforeEach(() => {
  store.clear();
  uuidCounter = 0;
  invalidateLogsCache();
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════
// 1. CRUD operations
// ═══════════════════════════════════════════

describe('CRUD operations', () => {
  describe('loadLogs', () => {
    it('returns empty array when no data', () => {
      expect(loadLogs()).toEqual([]);
    });

    it('returns logs sorted by createdAt descending', () => {
      const older = makeLog({ id: 'a', createdAt: '2025-01-01T00:00:00Z' });
      const newer = makeLog({ id: 'b', createdAt: '2025-02-01T00:00:00Z' });
      store.set(LOGS_KEY, JSON.stringify([older, newer]));
      const result = loadLogs();
      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
    });

    it('excludes trashed logs', () => {
      const active = makeLog({ id: 'a' });
      const trashed = makeLog({ id: 'b', trashedAt: Date.now() });
      store.set(LOGS_KEY, JSON.stringify([active, trashed]));
      expect(loadLogs()).toHaveLength(1);
      expect(loadLogs()[0].id).toBe('a');
    });

    it('returns empty array on invalid JSON', () => {
      store.set(LOGS_KEY, 'not-json');
      expect(loadLogs()).toEqual([]);
    });
  });

  describe('addLog', () => {
    it('adds a log entry', () => {
      const log = makeLog({ id: 'new-log' });
      addLog(log);
      const logs = loadLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('new-log');
    });

    it('prepends to existing logs', () => {
      const first = makeLog({ id: 'first', createdAt: '2025-01-01T00:00:00Z' });
      const second = makeLog({ id: 'second', createdAt: '2025-02-01T00:00:00Z' });
      addLog(first);
      addLog(second);
      const raw = JSON.parse(store.get(LOGS_KEY)!);
      // second was unshifted, so it appears first in the raw array
      expect(raw[0].id).toBe('second');
    });
  });

  describe('updateLog', () => {
    it('updates matching log with patch', () => {
      addLog(makeLog({ id: 'x', title: 'Old Title' }));
      updateLog('x', { title: 'New Title' });
      expect(getLog('x')?.title).toBe('New Title');
    });

    it('does not affect other logs', () => {
      addLog(makeLog({ id: 'a', title: 'A' }));
      addLog(makeLog({ id: 'b', title: 'B' }));
      updateLog('a', { title: 'A2' });
      expect(getLog('b')?.title).toBe('B');
    });
  });

  describe('deleteLog', () => {
    it('permanently removes the log', () => {
      addLog(makeLog({ id: 'del' }));
      expect(loadLogs()).toHaveLength(1);
      deleteLog('del');
      expect(loadLogs()).toHaveLength(0);
    });

    it('cascade deletes associated todos', () => {
      addLog(makeLog({ id: 'log1' }));
      const todo = makeTodo({ logId: 'log1' });
      const unrelated = makeTodo({ logId: 'other' });
      saveTodos([todo, unrelated]);
      deleteLog('log1');
      const remaining = loadTodos();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].logId).toBe('other');
    });

    it('cascade cleans MasterNote sourceLogIds', () => {
      const mn = makeMasterNote('proj1', {
        decisions: [{ text: 'd', sourceLogIds: ['log1', 'log2'] }],
        openIssues: [{ text: 'i', sourceLogIds: ['log1'] }],
        nextActions: [{ text: 'a', sourceLogIds: ['log3'] }],
        relatedLogIds: ['log1', 'log2'],
      });
      store.set(MASTER_NOTES_KEY, JSON.stringify([mn]));
      addLog(makeLog({ id: 'log1' }));

      deleteLog('log1');

      const notes = loadMasterNotes();
      expect(notes[0].decisions[0].sourceLogIds).toEqual(['log2']);
      expect(notes[0].openIssues[0].sourceLogIds).toEqual([]);
      expect(notes[0].nextActions[0].sourceLogIds).toEqual(['log3']);
      expect(notes[0].relatedLogIds).toEqual(['log2']);
    });
  });
});

// ═══════════════════════════════════════════
// 2. Trash handling
// ═══════════════════════════════════════════

describe('Trash handling', () => {
  describe('trashLog / restoreLog', () => {
    it('trashLog sets trashedAt and clears pinned', () => {
      addLog(makeLog({ id: 't1', pinned: true }));
      trashLog('t1');
      const trashed = loadTrashedLogs();
      expect(trashed).toHaveLength(1);
      expect(trashed[0].trashedAt).toBeGreaterThan(0);
      expect(trashed[0].pinned).toBe(false);
      expect(loadLogs()).toHaveLength(0);
    });

    it('restoreLog removes trashedAt', () => {
      addLog(makeLog({ id: 'r1' }));
      trashLog('r1');
      expect(loadTrashedLogs()).toHaveLength(1);
      restoreLog('r1');
      expect(loadTrashedLogs()).toHaveLength(0);
      expect(loadLogs()).toHaveLength(1);
    });
  });

  describe('trashProject / restoreProject', () => {
    it('trashes and restores a project', () => {
      const proj = makeProject({ id: 'p1' });
      store.set(PROJECTS_KEY, JSON.stringify([proj]));
      trashProject('p1');
      expect(loadProjects()).toHaveLength(0);
      expect(loadTrashedProjects()).toHaveLength(1);
      restoreProject('p1');
      expect(loadProjects()).toHaveLength(1);
      expect(loadTrashedProjects()).toHaveLength(0);
    });
  });

  describe('purgeExpiredTrash', () => {
    it('purges logs trashed more than 30 days ago', () => {
      vi.useFakeTimers();
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const recentTrash = Date.now() - 5 * 24 * 60 * 60 * 1000;

      const expired = makeLog({ id: 'exp', trashedAt: thirtyOneDaysAgo });
      const recent = makeLog({ id: 'rec', trashedAt: recentTrash });
      const active = makeLog({ id: 'act' });
      store.set(LOGS_KEY, JSON.stringify([expired, recent, active]));

      purgeExpiredTrash();

      const allRaw: LogEntry[] = JSON.parse(store.get(LOGS_KEY)!);
      const ids = allRaw.map((l) => l.id);
      expect(ids).not.toContain('exp');
      expect(ids).toContain('rec');
      expect(ids).toContain('act');
    });

    it('purges expired trashed projects', () => {
      vi.useFakeTimers();
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const proj = makeProject({ id: 'ep', trashedAt: thirtyOneDaysAgo });
      store.set(PROJECTS_KEY, JSON.stringify([proj]));

      purgeExpiredTrash();

      const remaining: Project[] = JSON.parse(store.get(PROJECTS_KEY)!);
      expect(remaining).toHaveLength(0);
    });

    it('purges expired trashed todos', () => {
      vi.useFakeTimers();
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const todo = makeTodo({ id: 'et', trashedAt: thirtyOneDaysAgo });
      const kept = makeTodo({ id: 'kt' });
      saveTodos([todo, kept]);

      purgeExpiredTrash();

      const remaining: Todo[] = JSON.parse(store.get(TODOS_KEY)!);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('kt');
    });
  });
});

// ═══════════════════════════════════════════
// 3. Cascade deletes (deleteProject)
// ═══════════════════════════════════════════

describe('deleteProject cascade', () => {
  const projId = 'cascade-proj';

  beforeEach(() => {
    // Set up a project with all associated data
    store.set(PROJECTS_KEY, JSON.stringify([makeProject({ id: projId })]));
    store.set(MASTER_NOTES_KEY, JSON.stringify([makeMasterNote(projId)]));
    store.set(MN_HISTORY_KEY, JSON.stringify([{ projectId: projId, snapshots: [{ version: 1, note: makeMasterNote(projId), savedAt: Date.now() }] }]));
    store.set(KNOWLEDGE_BASE_KEY, JSON.stringify([makeKnowledgeBase(projId)]));
    store.set(WEEKLY_REPORTS_KEY, JSON.stringify([makeWeeklyReport(projId)]));

    // Logs assigned to this project
    const assignedLog = makeLog({ id: 'assigned', projectId: projId });
    const unassignedLog = makeLog({ id: 'other', projectId: 'other-proj' });
    store.set(LOGS_KEY, JSON.stringify([assignedLog, unassignedLog]));

    // AI context
    store.set(`lore_ai_context_${projId}`, 'some context');
  });

  it('removes the project', () => {
    deleteProject(projId);
    expect(loadProjects()).toHaveLength(0);
  });

  it('deletes MasterNote', () => {
    deleteProject(projId);
    expect(getMasterNote(projId)).toBeUndefined();
  });

  it('deletes MasterNote history', () => {
    deleteProject(projId);
    expect(getMasterNoteHistory(projId)).toEqual([]);
  });

  it('deletes KnowledgeBase', () => {
    deleteProject(projId);
    expect(getKnowledgeBase(projId)).toBeUndefined();
  });

  it('deletes weekly reports for the project', () => {
    deleteProject(projId);
    expect(loadWeeklyReports()).toHaveLength(0);
  });

  it('unassigns logs (removes projectId) but keeps them', () => {
    deleteProject(projId);
    const logs = loadLogs();
    const assigned = logs.find((l) => l.id === 'assigned');
    expect(assigned).toBeDefined();
    expect(assigned!.projectId).toBeUndefined();
    // Other logs remain untouched
    const other = logs.find((l) => l.id === 'other');
    expect(other?.projectId).toBe('other-proj');
  });

  it('deletes AI context', () => {
    deleteProject(projId);
    expect(store.has(`lore_ai_context_${projId}`)).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 4. Import / Export
// ═══════════════════════════════════════════

describe('Import / Export', () => {
  describe('exportAllData', () => {
    it('exports all data stores', () => {
      const log = makeLog({ id: 'e1' });
      store.set(LOGS_KEY, JSON.stringify([log]));
      const proj = makeProject({ id: 'p1' });
      store.set(PROJECTS_KEY, JSON.stringify([proj]));

      const backup = exportAllData();
      expect(backup.version).toBe(1);
      expect(backup.exportedAt).toBeTruthy();
      expect(backup.data[LOGS_KEY]).toHaveLength(1);
      expect(backup.data[PROJECTS_KEY]).toHaveLength(1);
    });
  });

  describe('validateBackup', () => {
    it('accepts valid backup', () => {
      expect(validateBackup({ version: 1, exportedAt: '2025-01-01', data: { key: [] } })).toBe(true);
    });

    it('rejects invalid structures', () => {
      expect(validateBackup(null)).toBe(false);
      expect(validateBackup({ version: 2, data: {} })).toBe(false);
      expect(validateBackup({ version: 1, data: { key: 'not-array' } })).toBe(false);
    });
  });

  describe('importData - overwrite mode', () => {
    it('replaces existing data', () => {
      // Pre-existing data
      store.set(LOGS_KEY, JSON.stringify([makeLog({ id: 'old' })]));

      const backup: LoreBackup = {
        version: 1,
        exportedAt: '2025-01-01',
        data: {
          [LOGS_KEY]: [makeLog({ id: 'new1' }), makeLog({ id: 'new2' })],
        },
      };

      const result = importData(backup, 'overwrite');
      expect(result.logs).toBe(2);

      const logs: LogEntry[] = JSON.parse(store.get(LOGS_KEY)!);
      expect(logs).toHaveLength(2);
      expect(logs.map((l) => l.id).sort()).toEqual(['new1', 'new2']);
    });
  });

  describe('importData - merge mode', () => {
    it('merges by id, incoming wins on conflict', () => {
      const existing = makeLog({ id: 'shared', title: 'Old' });
      const unique = makeLog({ id: 'only-local', title: 'Local' });
      store.set(LOGS_KEY, JSON.stringify([existing, unique]));

      const backup: LoreBackup = {
        version: 1,
        exportedAt: '2025-01-01',
        data: {
          [LOGS_KEY]: [
            makeLog({ id: 'shared', title: 'New' }),
            makeLog({ id: 'only-remote', title: 'Remote' }),
          ],
        },
      };

      const result = importData(backup, 'merge');
      expect(result.logs).toBe(3); // only-local + shared (updated) + only-remote

      const logs: LogEntry[] = JSON.parse(store.get(LOGS_KEY)!);
      const sharedLog = logs.find((l) => (l as unknown as Record<string, unknown>).id === 'shared') as LogEntry;
      expect(sharedLog.title).toBe('New'); // incoming wins
    });
  });
});

// ═══════════════════════════════════════════
// 5. MasterNote snapshots
// ═══════════════════════════════════════════

describe('MasterNote snapshots', () => {
  it('saves a snapshot when updating a MasterNote', () => {
    const note1 = makeMasterNote('p1', { overview: 'v1', updatedAt: 1000 });
    // First save - no previous, so no snapshot
    saveMasterNote(note1);
    expect(getMasterNoteHistory('p1')).toHaveLength(0);

    // Second save triggers snapshot of note1
    const note2 = makeMasterNote('p1', { overview: 'v2', updatedAt: 2000 });
    saveMasterNote(note2);
    const history = getMasterNoteHistory('p1');
    expect(history).toHaveLength(1);
    expect(history[0].note.overview).toBe('v1');
  });

  it('caps snapshots at MAX_MN_SNAPSHOTS (50)', () => {
    const projId = 'snap-proj';
    // Build up 51 saves (first save creates no snapshot, saves 2-51 create 50 snapshots)
    for (let i = 0; i <= 51; i++) {
      saveMasterNote(makeMasterNote(projId, { overview: `v${i}`, updatedAt: i * 1000 }));
    }

    const history = getMasterNoteHistory(projId);
    expect(history.length).toBeLessThanOrEqual(50);
  });

  it('keeps the most recent snapshots when capping', () => {
    const projId = 'cap-proj';
    // First save: no snapshot. Then 55 more saves = 55 snapshots -> capped to 50
    for (let i = 0; i < 57; i++) {
      saveMasterNote(makeMasterNote(projId, { overview: `v${i}`, updatedAt: (i + 1) * 1000 }));
    }

    const history = getMasterNoteHistory(projId);
    expect(history).toHaveLength(50);
    // History is sorted descending by savedAt, so first entry is the most recent snapshot
    // The most recent snapshot should be from the second-to-last save (v55, updatedAt 56000)
    expect(history[0].note.updatedAt).toBeGreaterThan(history[history.length - 1].note.updatedAt);
  });
});

// ═══════════════════════════════════════════
// 6. safeSetItem
// ═══════════════════════════════════════════

describe('safeSetItem', () => {
  it('should not throw when localStorage.setItem throws QuotaExceededError', () => {
    // Replace setItem to simulate quota exceeded
    const origSetItem = localStorage.setItem;
    (localStorage as Storage).setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    };

    // saveLogs uses safeSetItem internally — should not throw
    expect(() => saveLogs([makeLog({ id: 'overflow' })])).not.toThrow();

    // Restore
    (localStorage as Storage).setItem = origSetItem;
  });
});

// ═══════════════════════════════════════════
// 7. ID generation (duplicateLog)
// ═══════════════════════════════════════════

describe('duplicateLog', () => {
  it('creates a new log with a unique ID', () => {
    const original = makeLog({ id: 'orig', title: 'Original' });
    addLog(original);

    const newId = duplicateLog('orig', ' (copy)');
    expect(newId).toBeTruthy();
    expect(newId).not.toBe('orig');

    const dup = getLog(newId!);
    expect(dup).toBeDefined();
    expect(dup!.title).toBe('Original (copy)');
    expect(dup!.id).toBe(newId);
  });

  it('returns null for non-existent log', () => {
    expect(duplicateLog('nonexistent', ' (copy)')).toBeNull();
  });

  it('strips trashedAt and pinned from the duplicate', () => {
    const original = makeLog({ id: 'trashed-orig', trashedAt: Date.now(), pinned: true });
    addLog(original);
    const newId = duplicateLog('trashed-orig', ' (dup)');
    const dup = getLog(newId!);
    expect(dup!.trashedAt).toBeUndefined();
    expect(dup!.pinned).toBeUndefined();
  });

  it('sets a fresh createdAt and clears updatedAt', () => {
    const original = makeLog({
      id: 'date-orig',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-06-01T00:00:00Z',
    });
    addLog(original);
    const newId = duplicateLog('date-orig', ' (dup)');
    const dup = getLog(newId!);
    expect(dup!.createdAt).not.toBe('2020-01-01T00:00:00Z');
    expect(dup!.updatedAt).toBeUndefined();
  });

  it('generates different IDs for multiple duplicates', () => {
    addLog(makeLog({ id: 'src' }));
    const id1 = duplicateLog('src', ' (1)');
    const id2 = duplicateLog('src', ' (2)');
    expect(id1).not.toBe(id2);
  });
});
