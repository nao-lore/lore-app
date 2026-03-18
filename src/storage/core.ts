import type { LogEntry, Project, MasterNote, Todo } from '../types';
import { saveToIdb, loadFromIdb } from './indexedDb';

// ─── Storage Keys ───

export const LOGS_KEY = 'threadlog_logs';
export const MIGRATION_KEY = 'threadlog_migration_v2';
export const LANG_KEY = 'threadlog_lang';
export const THEME_KEY = 'threadlog_theme';
export const PROJECTS_KEY = 'threadlog_projects';
export const MASTER_NOTES_KEY = 'threadlog_master_notes';
export const TODOS_KEY = 'threadlog_todos';
export const LOG_SUMMARIES_KEY = 'threadlog_log_summaries';
export const MN_HISTORY_KEY = 'threadlog_mn_history';
export const KNOWLEDGE_BASE_KEY = 'threadlog_knowledge_bases';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const MAX_MN_SNAPSHOTS = 50;

// ─── Safe localStorage wrappers ───

/** Safely read from localStorage, returning null on error */
export function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { if (import.meta.env.DEV) console.error(`Failed to read localStorage key: ${key}`); return null; }
}

/** Safely remove a key from localStorage */
export function safeRemoveItem(key: string): void {
  try { localStorage.removeItem(key); } catch { if (import.meta.env.DEV) console.error(`Failed to remove localStorage key: ${key}`); }
}

/** Safely write to localStorage, dispatching event on quota exceeded.
 *  Falls back to IndexedDB when quota is exceeded. */
export function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch (e) {
    if (import.meta.env.DEV) console.error(`Failed to write localStorage key: ${key}`);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lore-storage-full'));
      // Fallback: persist to IndexedDB so data is not lost
      try {
        saveToIdb(key, value).catch((err) => {
          if (import.meta.env.DEV) console.error(`IDB fallback write failed for key: ${key}`, err);
        });
      } catch { /* saveToIdb import may fail in non-browser env */ }
    }
  }
}

/** Try localStorage first, then fall back to IndexedDB.
 *  Returns a Promise because IDB reads are async. */
export async function loadWithIdbFallback(key: string): Promise<string | null> {
  const local = safeGetItem(key);
  if (local !== null) return local;
  try {
    const idbVal = await loadFromIdb(key);
    return typeof idbVal === 'string' ? idbVal : null;
  } catch {
    return null;
  }
}

// ─── In-memory caches (avoid re-parsing localStorage on every read) ───
// Wrapped in a single object so mutable state is shared across modules.

export const cache = {
  logsCacheVersion: 0,
  logsCache: { data: null as LogEntry[] | null, version: 0 },

  projectsCacheVersion: 0,
  projectsCache: { data: null as Project[] | null, version: 0 },

  todosCacheVersion: 0,
  todosCache: { data: null as Todo[] | null, version: 0 },

  masterNotesCacheVersion: 0,
  masterNotesCache: { data: null as MasterNote[] | null, version: 0 },
};

/** Invalidate the logs cache — call after any direct localStorage write to LOGS_KEY */
export function invalidateLogsCache(): void {
  cache.logsCacheVersion++;
  cache.logsCache.data = null;
}

/** Invalidate the projects cache — call after any direct localStorage write to PROJECTS_KEY */
export function invalidateProjectsCache(): void {
  cache.projectsCacheVersion++;
  cache.projectsCache.data = null;
}

/** Invalidate the todos cache — call after any direct localStorage write to TODOS_KEY */
export function invalidateTodosCache(): void {
  cache.todosCacheVersion++;
  cache.todosCache.data = null;
}

/** Invalidate the master notes cache — call after any direct localStorage write to MASTER_NOTES_KEY */
export function invalidateMasterNotesCache(): void {
  cache.masterNotesCacheVersion++;
  cache.masterNotesCache.data = null;
}
