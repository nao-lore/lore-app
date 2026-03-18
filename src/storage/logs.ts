import type { LogEntry } from '../types';
import { LOGS_KEY, MIGRATION_KEY, safeGetItem, safeSetItem, cache, invalidateLogsCache } from './core';
import { deleteTodosForLog } from './todos';
import { cleanMasterNoteSourceLogIds } from './masterNotes';

// ─── Logs ───

/** Persist the full logs array to localStorage */
export function saveLogs(logs: LogEntry[]): void {
  safeSetItem(LOGS_KEY, JSON.stringify(logs));
  invalidateLogsCache();
}

/** Load all logs (including trashed) — raw access, with in-memory cache */
export function loadAllLogs(): LogEntry[] {
  // Return cached data if still valid
  if (cache.logsCache.data !== null && cache.logsCache.version === cache.logsCacheVersion) {
    return cache.logsCache.data;
  }

  const raw = safeGetItem(LOGS_KEY);
  if (!raw) return [];
  try {
    const logs: LogEntry[] = JSON.parse(raw);
    // Auto-migrate: strip sourceText from old logs on first load
    if (!safeGetItem(MIGRATION_KEY) && logs.some((l) => l.sourceText)) {
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
      const sorted = migrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      cache.logsCache = { data: sorted, version: cache.logsCacheVersion };
      return sorted;
    }
    const sorted = logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    cache.logsCache = { data: sorted, version: cache.logsCacheVersion };
    return sorted;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[storage] loadAllLogs', err);
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

/** Add a new log entry at the top of the list */
export function addLog(entry: LogEntry): void {
  const logs = [...loadAllLogs()];
  logs.unshift(entry);
  saveLogs(logs);
}

/** Find a log by ID */
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

/** Update a log entry with a partial patch */
export function updateLog(id: string, patch: Partial<LogEntry>): void {
  const logs = loadAllLogs().map((l) => l.id === id ? { ...l, ...patch } : l);
  saveLogs(logs);
}

/** Duplicate a log with a new ID and title suffix */
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

/** Create a bidirectional link between two logs */
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

/** Remove a bidirectional link between two logs */
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

// ─── Log Summaries ───

import { LOG_SUMMARIES_KEY } from './core';
import type { LogSummary } from '../types';

/** Load all cached log summaries */
export function loadLogSummaries(): LogSummary[] {
  const raw = safeGetItem(LOG_SUMMARIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) { if (import.meta.env.DEV) console.warn('[storage] loadLogSummaries', err); return []; }
}

/** Save or update a log summary (replaces existing for same logId) */
export function saveLogSummary(summary: LogSummary): void {
  const summaries = loadLogSummaries().filter((s) => s.logId !== summary.logId);
  summaries.push(summary);
  safeSetItem(LOG_SUMMARIES_KEY, JSON.stringify(summaries));
}

/** Get a cached summary for a specific log */
export function getLogSummary(logId: string): LogSummary | undefined {
  return loadLogSummaries().find((s) => s.logId === logId);
}
