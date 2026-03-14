import type { LogEntry, Project, MasterNote, MasterNoteHistory, MasterNoteSnapshot, Todo, LogSummary, WeeklyReport, KnowledgeBase } from './types';

import type { Lang } from './i18n';

const LOGS_KEY = 'threadlog_logs';
const MIGRATION_KEY = 'threadlog_migration_v2';
const LANG_KEY = 'threadlog_lang';
const THEME_KEY = 'threadlog_theme';
const PROJECTS_KEY = 'threadlog_projects';
const MASTER_NOTES_KEY = 'threadlog_master_notes';
const TODOS_KEY = 'threadlog_todos';
const LOG_SUMMARIES_KEY = 'threadlog_log_summaries';
const MN_HISTORY_KEY = 'threadlog_mn_history';
const KNOWLEDGE_BASE_KEY = 'threadlog_knowledge_bases';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const MAX_MN_SNAPSHOTS = 50;

/** Safely write to localStorage, silently catching QuotaExceededError */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // QuotaExceededError — silently ignore to prevent app crash
  }
}

// ─── Trash helpers ───

/** Purge items trashed more than 30 days ago from all stores (with cascade) */
export function purgeExpiredTrash(): void {
  const now = Date.now();

  // Logs — use deleteLog() for cascade cleanup
  const rawLogs = localStorage.getItem(LOGS_KEY);
  if (rawLogs) {
    try {
      const logs: LogEntry[] = JSON.parse(rawLogs);
      const expired = logs.filter((l) => l.trashedAt && now - l.trashedAt >= TRASH_RETENTION_MS);
      for (const l of expired) deleteLog(l.id);
    } catch { /* ignore */ }
  }

  // Projects — use deleteProject() for cascade cleanup
  const rawProjects = localStorage.getItem(PROJECTS_KEY);
  if (rawProjects) {
    try {
      const projects: Project[] = JSON.parse(rawProjects);
      const expired = projects.filter((p) => p.trashedAt && now - p.trashedAt >= TRASH_RETENTION_MS);
      for (const p of expired) deleteProject(p.id);
    } catch { /* ignore */ }
  }

  // Todos — simple removal (no cascade needed)
  const rawTodos = localStorage.getItem(TODOS_KEY);
  if (rawTodos) {
    try {
      const todos: Todo[] = JSON.parse(rawTodos);
      const kept = todos.filter((t) => !t.trashedAt || now - t.trashedAt < TRASH_RETENTION_MS);
      if (kept.length !== todos.length) safeSetItem(TODOS_KEY, JSON.stringify(kept));
    } catch { /* ignore */ }
  }
}

// ─── Logs ───

export function saveLogs(logs: LogEntry[]): void {
  safeSetItem(LOGS_KEY, JSON.stringify(logs));
}

/** Load all logs (including trashed) — raw access */
function loadAllLogs(): LogEntry[] {
  const raw = localStorage.getItem(LOGS_KEY);
  if (!raw) return [];
  try {
    const logs: LogEntry[] = JSON.parse(raw);
    // Auto-migrate: strip sourceText from old logs on first load
    if (!localStorage.getItem(MIGRATION_KEY) && logs.some((l) => l.sourceText)) {
      const migrated = logs.map((l) => {
        if (!l.sourceText) return l;
        const { sourceText, ...rest } = l;
        if (!rest.sourceReference) {
          rest.sourceReference = {
            sourceType: 'unknown',
            importedAt: l.importedAt || l.createdAt,
            charCount: sourceText.length,
          };
        }
        return rest;
      });
      safeSetItem(LOGS_KEY, JSON.stringify(migrated));
      safeSetItem(MIGRATION_KEY, '1');
      return migrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

/** Load active (non-trashed) logs */
export function loadLogs(): LogEntry[] {
  return loadAllLogs().filter((l) => !l.trashedAt);
}

/** Load trashed logs */
export function loadTrashedLogs(): LogEntry[] {
  return loadAllLogs().filter((l) => !!l.trashedAt);
}

export function addLog(entry: LogEntry): void {
  const logs = loadAllLogs();
  logs.unshift(entry);
  saveLogs(logs);
}

export function getLog(id: string): LogEntry | undefined {
  return loadAllLogs().find((l) => l.id === id);
}

/** Move log to trash */
export function trashLog(id: string): void {
  const logs = loadAllLogs().map((l) => l.id === id ? { ...l, trashedAt: Date.now(), pinned: false } : l);
  saveLogs(logs);
}

/** Restore log from trash */
export function restoreLog(id: string): void {
  const logs = loadAllLogs().map((l) => {
    if (l.id !== id) return l;
    const { trashedAt: _, ...rest } = l;
    void _;
    return rest as LogEntry;
  });
  saveLogs(logs);
}

/** Permanently delete log (with cascade cleanup) */
export function deleteLog(id: string): void {
  const logs = loadAllLogs().filter((l) => l.id !== id);
  saveLogs(logs);
  // Cascade: delete associated TODOs
  deleteTodosForLog(id);
  // Cascade: clean MasterNote sourceLogIds
  cleanMasterNoteSourceLogIds(id);
}

export function updateLog(id: string, patch: Partial<LogEntry>): void {
  const logs = loadAllLogs().map((l) => l.id === id ? { ...l, ...patch } : l);
  saveLogs(logs);
}

export function duplicateLog(id: string, titleSuffix: string): string | null {
  const log = getLog(id);
  if (!log) return null;
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { trashedAt: _, pinned: _p, ...rest } = log;
  void _; void _p;
  const newLog: LogEntry = {
    ...rest,
    id: newId,
    title: log.title + titleSuffix,
    createdAt: now,
    updatedAt: undefined,
  };
  addLog(newLog);
  return newId;
}

// ─── Log Linking (bidirectional backlinks) ───

export function linkLogs(logId1: string, logId2: string): void {
  const logs = loadAllLogs().map((l) => {
    if (l.id === logId1) {
      const ids = new Set(l.relatedLogIds || []);
      ids.add(logId2);
      return { ...l, relatedLogIds: [...ids] };
    }
    if (l.id === logId2) {
      const ids = new Set(l.relatedLogIds || []);
      ids.add(logId1);
      return { ...l, relatedLogIds: [...ids] };
    }
    return l;
  });
  saveLogs(logs);
}

export function unlinkLogs(logId1: string, logId2: string): void {
  const logs = loadAllLogs().map((l) => {
    if (l.id === logId1) {
      return { ...l, relatedLogIds: (l.relatedLogIds || []).filter((id) => id !== logId2) };
    }
    if (l.id === logId2) {
      return { ...l, relatedLogIds: (l.relatedLogIds || []).filter((id) => id !== logId1) };
    }
    return l;
  });
  saveLogs(logs);
}

// ─── Projects ───

function loadAllProjects(): Project[] {
  const raw = localStorage.getItem(PROJECTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function loadProjects(): Project[] {
  return loadAllProjects().filter((p) => !p.trashedAt);
}

export function loadTrashedProjects(): Project[] {
  return loadAllProjects().filter((p) => !!p.trashedAt);
}

export function saveProjects(projects: Project[]): void {
  safeSetItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function addProject(name: string): Project {
  const project: Project = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  const projects = loadAllProjects();
  projects.push(project);
  saveProjects(projects);
  return project;
}

/** Move project to trash */
export function trashProject(id: string): void {
  const projects = loadAllProjects().map((p) => p.id === id ? { ...p, trashedAt: Date.now(), pinned: false } : p);
  saveProjects(projects);
}

/** Restore project from trash */
export function restoreProject(id: string): void {
  const projects = loadAllProjects().map((p) => {
    if (p.id !== id) return p;
    const { trashedAt: _, ...rest } = p;
    void _;
    return rest as Project;
  });
  saveProjects(projects);
}

export function deleteProject(id: string): void {
  saveProjects(loadAllProjects().filter((p) => p.id !== id));
  // Cascade: delete MasterNote + history + AI Context
  deleteMasterNote(id);
  deleteMasterNoteHistory(id);
  deleteAiContext(id);
  // Cascade: delete KnowledgeBase
  deleteKnowledgeBase(id);
  // Cascade: delete WeeklyReports for this project
  deleteWeeklyReportsForProject(id);
  // Unassign logs from deleted project (keep the logs)
  const logs = loadAllLogs().map((l) => {
    if (l.projectId === id) {
      const { projectId: _, ...rest } = l;
      void _;
      return rest as LogEntry;
    }
    return l;
  });
  saveLogs(logs);
}

export function renameProject(id: string, name: string): void {
  saveProjects(loadAllProjects().map((p) => p.id === id ? { ...p, name } : p));
}

export function updateProject(id: string, patch: Partial<Project>): void {
  saveProjects(loadAllProjects().map((p) => p.id === id ? { ...p, ...patch } : p));
}

// ─── Master Notes ───

export function loadMasterNotes(): MasterNote[] {
  const raw = localStorage.getItem(MASTER_NOTES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function getMasterNote(projectId: string): MasterNote | undefined {
  return loadMasterNotes().find((n) => n.projectId === projectId);
}

export function saveMasterNote(note: MasterNote): void {
  // Save snapshot of the previous version before overwriting
  const prev = getMasterNote(note.projectId);
  if (prev) {
    pushMasterNoteSnapshot(prev);
  }

  const notes = loadMasterNotes().filter((n) => n.projectId !== note.projectId);
  notes.push(note);
  safeSetItem(MASTER_NOTES_KEY, JSON.stringify(notes));
}

export function deleteMasterNote(projectId: string): void {
  const notes = loadMasterNotes().filter((n) => n.projectId !== projectId);
  safeSetItem(MASTER_NOTES_KEY, JSON.stringify(notes));
}

/** Remove a deleted log ID from all MasterNote sourceLogIds and relatedLogIds */
function cleanMasterNoteSourceLogIds(logId: string): void {
  const notes = loadMasterNotes();
  let changed = false;
  const updated = notes.map((n) => {
    const cleanSourced = (items: { text: string; sourceLogIds: string[] }[]) =>
      items.map((item) => {
        const filtered = item.sourceLogIds.filter((id) => id !== logId);
        if (filtered.length !== item.sourceLogIds.length) { changed = true; return { ...item, sourceLogIds: filtered }; }
        return item;
      });
    const decisions = cleanSourced(n.decisions);
    const openIssues = cleanSourced(n.openIssues);
    const nextActions = cleanSourced(n.nextActions);
    const relatedLogIds = n.relatedLogIds.filter((id) => id !== logId);
    if (relatedLogIds.length !== n.relatedLogIds.length) changed = true;
    return { ...n, decisions, openIssues, nextActions, relatedLogIds };
  });
  if (changed) safeSetItem(MASTER_NOTES_KEY, JSON.stringify(updated));
}

// ─── Master Note History ───

function loadAllMnHistory(): MasterNoteHistory[] {
  const raw = localStorage.getItem(MN_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveMnHistory(histories: MasterNoteHistory[]): void {
  safeSetItem(MN_HISTORY_KEY, JSON.stringify(histories));
}

function pushMasterNoteSnapshot(note: MasterNote): void {
  const all = loadAllMnHistory();
  let history = all.find((h) => h.projectId === note.projectId);
  if (!history) {
    history = { projectId: note.projectId, snapshots: [] };
    all.push(history);
  }
  const nextVersion = history.snapshots.length > 0
    ? Math.max(...history.snapshots.map((s) => s.version)) + 1
    : 1;
  history.snapshots.push({
    version: nextVersion,
    note: { ...note },
    savedAt: note.updatedAt,
  });
  // Cap snapshots: keep only the most recent MAX_MN_SNAPSHOTS
  if (history.snapshots.length > MAX_MN_SNAPSHOTS) {
    history.snapshots.sort((a, b) => a.savedAt - b.savedAt);
    history.snapshots = history.snapshots.slice(-MAX_MN_SNAPSHOTS);
  }
  saveMnHistory(all);
}

export function getMasterNoteHistory(projectId: string): MasterNoteSnapshot[] {
  const history = loadAllMnHistory().find((h) => h.projectId === projectId);
  return history ? [...history.snapshots].sort((a, b) => b.savedAt - a.savedAt) : [];
}

/** Delete all MasterNote history for a project */
function deleteMasterNoteHistory(projectId: string): void {
  const all = loadAllMnHistory().filter((h) => h.projectId !== projectId);
  saveMnHistory(all);
}

export function restoreMasterNoteSnapshot(projectId: string, version: number): MasterNote | undefined {
  const snapshots = getMasterNoteHistory(projectId);
  const snap = snapshots.find((s) => s.version === version);
  if (!snap) return undefined;
  const restored = { ...snap.note, updatedAt: Date.now() };
  // saveMasterNote will auto-push current as snapshot before overwriting
  saveMasterNote(restored);
  return restored;
}

// ─── Log Summaries ───

export function loadLogSummaries(): LogSummary[] {
  const raw = localStorage.getItem(LOG_SUMMARIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveLogSummary(summary: LogSummary): void {
  const summaries = loadLogSummaries().filter((s) => s.logId !== summary.logId);
  summaries.push(summary);
  safeSetItem(LOG_SUMMARIES_KEY, JSON.stringify(summaries));
}

export function getLogSummary(logId: string): LogSummary | undefined {
  return loadLogSummaries().find((s) => s.logId === logId);
}

// ─── Todos ───

function loadAllTodos(): Todo[] {
  const raw = localStorage.getItem(TODOS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function loadTodos(): Todo[] {
  return loadAllTodos().filter((t) => !t.trashedAt && !t.archivedAt);
}

export function loadArchivedTodos(): Todo[] {
  return loadAllTodos().filter((t) => !!t.archivedAt && !t.trashedAt);
}

export function loadTrashedTodos(): Todo[] {
  return loadAllTodos().filter((t) => !!t.trashedAt);
}

export function saveTodos(todos: Todo[]): void {
  safeSetItem(TODOS_KEY, JSON.stringify(todos));
}

export function addTodosFromLog(logId: string, items: string[]): void {
  if (items.length === 0) return;
  const todos = loadAllTodos();
  const now = Date.now();
  const newTodos: Todo[] = items.map((text) => ({
    id: crypto.randomUUID(),
    text,
    done: false,
    logId,
    createdAt: now,
  }));
  saveTodos([...newTodos, ...todos]);
}

export function addTodosFromLogWithMeta(logId: string, items: { title: string; priority?: 'high' | 'medium' | 'low'; dueDate?: string }[]): void {
  if (items.length === 0) return;
  const todos = loadAllTodos();
  const now = Date.now();
  const newTodos: Todo[] = items.map((item) => ({
    id: crypto.randomUUID(),
    text: item.title,
    done: false,
    logId,
    createdAt: now,
    ...(item.priority ? { priority: item.priority } : {}),
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
  }));
  saveTodos([...newTodos, ...todos]);
}

export function addManualTodo(text: string, extra?: Partial<Pick<Todo, 'dueDate' | 'priority' | 'tag'>>): void {
  const todos = loadAllTodos();
  const todo: Todo = {
    id: crypto.randomUUID(),
    text,
    done: false,
    logId: '',
    createdAt: Date.now(),
    ...extra,
  };
  saveTodos([todo, ...todos]);
}

/** Move todo to trash */
export function trashTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => t.id === id ? { ...t, trashedAt: Date.now() } : t));
}

/** Move all completed todos to trash */
export function trashCompletedTodos(): number {
  const all = loadAllTodos();
  let count = 0;
  const updated = all.map((t) => {
    if (t.done && !t.trashedAt) {
      count++;
      return { ...t, trashedAt: Date.now() };
    }
    return t;
  });
  if (count > 0) saveTodos(updated);
  return count;
}

/** Restore todo from trash */
export function restoreTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => {
    if (t.id !== id) return t;
    const { trashedAt: _, ...rest } = t;
    void _;
    return rest as Todo;
  }));
}

export function deleteTodo(id: string): void {
  saveTodos(loadAllTodos().filter((t) => t.id !== id));
}

export function updateTodo(id: string, patch: Partial<Todo>): void {
  const todos = loadAllTodos().map((t) => t.id === id ? { ...t, ...patch } : t);
  saveTodos(todos);
}

export function archiveTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => t.id === id ? { ...t, archivedAt: Date.now() } : t));
}

export function unarchiveTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => {
    if (t.id !== id) return t;
    const { archivedAt: _, ...rest } = t;
    void _;
    return rest as Todo;
  }));
}

export function bulkUpdateTodos(ids: string[], patch: Partial<Todo>): void {
  const idSet = new Set(ids);
  saveTodos(loadAllTodos().map((t) => idSet.has(t.id) ? { ...t, ...patch } : t));
}

export function bulkTrashTodos(ids: string[]): void {
  const idSet = new Set(ids);
  saveTodos(loadAllTodos().map((t) => idSet.has(t.id) ? { ...t, trashedAt: Date.now() } : t));
}

/** Save sort order for todos by ID list (index = sortOrder) */
export function reorderTodos(orderedIds: string[]): void {
  const all = loadAllTodos();
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  saveTodos(all.map((t) => orderMap.has(t.id) ? { ...t, sortOrder: orderMap.get(t.id) } : t));
}

export function snoozeTodo(id: string, until: number): void {
  saveTodos(loadAllTodos().map((t) => t.id === id ? { ...t, snoozedUntil: until } : t));
}

export function deleteTodosForLog(logId: string): void {
  saveTodos(loadAllTodos().filter((t) => t.logId !== logId));
}

// ─── Weekly Reports ───

const WEEKLY_REPORTS_KEY = 'threadlog_weekly_reports';

export function loadWeeklyReports(): WeeklyReport[] {
  const raw = localStorage.getItem(WEEKLY_REPORTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function saveWeeklyReport(report: WeeklyReport): void {
  const all = loadWeeklyReports().filter(
    (r) => !(r.weekStart === report.weekStart && (r.projectId || '') === (report.projectId || ''))
  );
  all.push(report);
  all.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  safeSetItem(WEEKLY_REPORTS_KEY, JSON.stringify(all));
}

export function getWeeklyReport(weekStart: string, projectId?: string): WeeklyReport | undefined {
  return loadWeeklyReports().find(
    (r) => r.weekStart === weekStart && (r.projectId || '') === (projectId || '')
  );
}

export function deleteWeeklyReport(id: string): void {
  const all = loadWeeklyReports().filter((r) => r.id !== id);
  safeSetItem(WEEKLY_REPORTS_KEY, JSON.stringify(all));
}

/** Delete all weekly reports for a project */
function deleteWeeklyReportsForProject(projectId: string): void {
  const all = loadWeeklyReports().filter((r) => (r.projectId || '') !== projectId);
  safeSetItem(WEEKLY_REPORTS_KEY, JSON.stringify(all));
}

// ─── Knowledge Base ───

export function loadKnowledgeBases(): KnowledgeBase[] {
  const raw = localStorage.getItem(KNOWLEDGE_BASE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getKnowledgeBase(projectId: string): KnowledgeBase | undefined {
  return loadKnowledgeBases().find((kb) => kb.projectId === projectId);
}

export function saveKnowledgeBase(kb: KnowledgeBase): void {
  const all = loadKnowledgeBases().filter((k) => k.projectId !== kb.projectId);
  all.push(kb);
  safeSetItem(KNOWLEDGE_BASE_KEY, JSON.stringify(all));
}

export function deleteKnowledgeBase(projectId: string): void {
  const all = loadKnowledgeBases().filter((k) => k.projectId !== projectId);
  safeSetItem(KNOWLEDGE_BASE_KEY, JSON.stringify(all));
}

// ─── AI Context (per-project) ───

const AI_CONTEXT_PREFIX = 'lore_ai_context_';

export function getAiContext(projectId: string): string | null {
  return localStorage.getItem(AI_CONTEXT_PREFIX + projectId) || null;
}

export function saveAiContext(projectId: string, content: string): void {
  safeSetItem(AI_CONTEXT_PREFIX + projectId, content);
}

export function deleteAiContext(projectId: string): void {
  localStorage.removeItem(AI_CONTEXT_PREFIX + projectId);
}

// ─── Data Export / Import ───

const DATA_KEYS = [LOGS_KEY, PROJECTS_KEY, MASTER_NOTES_KEY, TODOS_KEY, LOG_SUMMARIES_KEY, MN_HISTORY_KEY, WEEKLY_REPORTS_KEY, KNOWLEDGE_BASE_KEY] as const;

export interface LoreBackup {
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export function exportAllData(): LoreBackup {
  const data: Record<string, unknown[]> = {};
  for (const key of DATA_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { data[key] = JSON.parse(raw); } catch { /* skip */ }
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(obj: unknown): obj is LoreBackup {
  if (!obj || typeof obj !== 'object') return false;
  const b = obj as Record<string, unknown>;
  if (b.version !== 1 || typeof b.data !== 'object' || !b.data) return false;
  // Every key in data should be an array
  for (const val of Object.values(b.data as Record<string, unknown>)) {
    if (!Array.isArray(val)) return false;
  }
  return true;
}

export interface ImportResult {
  logs: number;
  projects: number;
  masterNotes: number;
  todos: number;
}

const KEY_TO_CATEGORY: Record<string, keyof ImportResult> = {
  [LOGS_KEY]: 'logs',
  [PROJECTS_KEY]: 'projects',
  [MASTER_NOTES_KEY]: 'masterNotes',
  [TODOS_KEY]: 'todos',
};

/** Import data. Returns per-category counts. */
export function importData(backup: LoreBackup, mode: 'merge' | 'overwrite'): ImportResult {
  const result: ImportResult = { logs: 0, projects: 0, masterNotes: 0, todos: 0 };

  for (const key of DATA_KEYS) {
    const incoming = backup.data[key];
    if (!incoming || !Array.isArray(incoming)) continue;
    const cat = KEY_TO_CATEGORY[key];

    if (mode === 'overwrite') {
      safeSetItem(key, JSON.stringify(incoming));
      if (cat) result[cat] = incoming.length;
    } else {
      // Merge: combine by id, incoming wins on conflict
      const raw = localStorage.getItem(key);
      let existing: Record<string, unknown>[] = [];
      if (raw) {
        try { existing = JSON.parse(raw); } catch { /* ignore */ }
      }
      const map = new Map<string, unknown>();
      for (const item of existing) {
        const id = (item as Record<string, unknown>).id || (item as Record<string, unknown>).projectId;
        if (id) map.set(String(id), item);
      }
      for (const item of incoming) {
        const r = item as Record<string, unknown>;
        const id = r.id || r.projectId;
        if (id) map.set(String(id), item);
        else map.set(crypto.randomUUID(), item);
      }
      const merged = Array.from(map.values());
      safeSetItem(key, JSON.stringify(merged));
      if (cat) result[cat] = merged.length;
    }
  }
  return result;
}

// ─── Data Usage ───

const RECOMMENDED_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB

export interface DataUsage {
  usedBytes: number;
  limitBytes: number;
  percentage: number; // 0–100+
}

/** Calculate approximate localStorage usage for Lore keys */
export function getDataUsage(): DataUsage {
  let totalBytes = 0;
  for (const key of DATA_KEYS) {
    const val = localStorage.getItem(key);
    if (val) {
      // Each char in JS string = 2 bytes in memory, but localStorage uses UTF-16
      totalBytes += (key.length + val.length) * 2;
    }
  }
  // Also count settings keys
  const settingsKeys = [LANG_KEY, THEME_KEY, 'threadlog_provider', 'threadlog_migration_v2'];
  for (const key of settingsKeys) {
    const val = localStorage.getItem(key);
    if (val) totalBytes += (key.length + val.length) * 2;
  }
  return {
    usedBytes: totalBytes,
    limitBytes: RECOMMENDED_LIMIT_BYTES,
    percentage: Math.round((totalBytes / RECOMMENDED_LIMIT_BYTES) * 100),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Settings ───

/** Returns the API key for the currently active provider */
export function getApiKey(): string {
  // Delegate to provider module (avoids circular import by reading directly)
  const provider = localStorage.getItem('threadlog_provider') || 'gemini';
  return localStorage.getItem(`threadlog_api_key_${provider}`) || '';
}

/** @deprecated Use setProviderApiKey from provider.ts instead */
export function setApiKey(key: string): void {
  const provider = localStorage.getItem('threadlog_provider') || 'gemini';
  safeSetItem(`threadlog_api_key_${provider}`, key);
}

/** Output language preference (for AI-generated content) */
const VALID_OUTPUT_LANGS = ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt'];

export function getLang(): string {
  const v = localStorage.getItem(LANG_KEY);
  if (v && VALID_OUTPUT_LANGS.includes(v)) return v;
  return 'auto';
}

export function setLang(lang: string): void {
  safeSetItem(LANG_KEY, lang);
}

const UI_LANG_KEY = 'threadlog_ui_lang';

/** UI display language */
const VALID_LANGS: Lang[] = ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt'];

export function getUiLang(): Lang {
  const v = localStorage.getItem(UI_LANG_KEY);
  if (v && VALID_LANGS.includes(v as Lang)) return v as Lang;
  return 'en';
}

export function setUiLang(lang: Lang): void {
  safeSetItem(UI_LANG_KEY, lang);
}

export type ThemePref = 'light' | 'dark' | 'system';

export function getTheme(): ThemePref {
  const v = localStorage.getItem(THEME_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

export function setTheme(theme: ThemePref): void {
  safeSetItem(THEME_KEY, theme);
}

// ─── Auto Weekly Report ───

const AUTO_REPORT_KEY = 'threadlog_auto_weekly_report';
const LAST_REPORT_DATE_KEY = 'threadlog_last_report_date';

export function getAutoReportSetting(): boolean {
  return localStorage.getItem(AUTO_REPORT_KEY) === 'true';
}

export function setAutoReportSetting(enabled: boolean): void {
  safeSetItem(AUTO_REPORT_KEY, String(enabled));
}

export function getLastReportDate(): number | null {
  const raw = localStorage.getItem(LAST_REPORT_DATE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

export function setLastReportDate(timestamp: number): void {
  safeSetItem(LAST_REPORT_DATE_KEY, String(timestamp));
}
