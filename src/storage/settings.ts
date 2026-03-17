import type { Lang } from '../i18n';
import type { LogEntry, Project, Todo } from '../types';
import { LANG_KEY, THEME_KEY, LOGS_KEY, PROJECTS_KEY, MASTER_NOTES_KEY, TODOS_KEY, LOG_SUMMARIES_KEY, MN_HISTORY_KEY, KNOWLEDGE_BASE_KEY, TRASH_RETENTION_MS, safeGetItem, safeSetItem, safeRemoveItem, invalidateLogsCache, invalidateProjectsCache, invalidateTodosCache, invalidateMasterNotesCache } from './core';
import { deleteLog } from './logs';
import { deleteProject } from './projects';

// ─── Settings ───

/** Returns the API key for the currently active provider */
export function getApiKey(): string {
  // Delegate to provider module (avoids circular import by reading directly)
  const provider = safeGetItem('threadlog_provider') || 'gemini';
  return safeGetItem(`threadlog_api_key_${provider}`) || '';
}

/** @deprecated Use setProviderApiKey from provider.ts instead */
export function setApiKey(key: string): void {
  const provider = safeGetItem('threadlog_provider') || 'gemini';
  safeSetItem(`threadlog_api_key_${provider}`, key);
}

/** Output language preference (for AI-generated content) */
const VALID_OUTPUT_LANGS = ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt'];

export function getLang(): string {
  const v = safeGetItem(LANG_KEY);
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
  const v = safeGetItem(UI_LANG_KEY);
  if (v && VALID_LANGS.includes(v as Lang)) return v as Lang;
  return 'en';
}

export function setUiLang(lang: Lang): void {
  safeSetItem(UI_LANG_KEY, lang);
}

export type ThemePref = 'light' | 'dark' | 'system';

export function getTheme(): ThemePref {
  const v = safeGetItem(THEME_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

export function setTheme(theme: ThemePref): void {
  safeSetItem(THEME_KEY, theme);
}

// ─── Demo Mode ───

const DEMO_MODE_KEY = 'threadlog_demo_mode';

export function isDemoMode(): boolean {
  return safeGetItem(DEMO_MODE_KEY) === '1';
}

export function setDemoMode(on: boolean): void {
  if (on) {
    safeSetItem(DEMO_MODE_KEY, '1');
  } else {
    safeRemoveItem(DEMO_MODE_KEY);
  }
}

// ─── Feature Toggles ───

const FEATURE_PREFIX = 'threadlog_feature_';

export function getFeatureEnabled(key: string, defaultValue = true): boolean {
  const v = safeGetItem(FEATURE_PREFIX + key);
  if (v === null) return defaultValue;
  return v === 'true';
}

export function setFeatureEnabled(key: string, enabled: boolean): void {
  safeSetItem(FEATURE_PREFIX + key, String(enabled));
}

// ─── Auto Weekly Report ───

const AUTO_REPORT_KEY = 'threadlog_auto_weekly_report';
const LAST_REPORT_DATE_KEY = 'threadlog_last_report_date';

export function getAutoReportSetting(): boolean {
  return safeGetItem(AUTO_REPORT_KEY) === 'true';
}

export function setAutoReportSetting(enabled: boolean): void {
  safeSetItem(AUTO_REPORT_KEY, String(enabled));
}

export function getLastReportDate(): number | null {
  const raw = safeGetItem(LAST_REPORT_DATE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

export function setLastReportDate(timestamp: number): void {
  safeSetItem(LAST_REPORT_DATE_KEY, String(timestamp));
}

// ─── Activity Streak ───

const ACTIVITY_DATES_KEY = 'threadlog_activity_dates';

export function recordActivity(): void {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = safeGetItem(ACTIVITY_DATES_KEY);
    const dates: string[] = raw ? JSON.parse(raw) : [];
    if (!dates.includes(today)) {
      dates.push(today);
      // Keep only last 90 days
      while (dates.length > 90) dates.shift();
      safeSetItem(ACTIVITY_DATES_KEY, JSON.stringify(dates));
    }
  } catch (err) { if (import.meta.env.DEV) console.warn('[storage] recordActivity', err); }
}

export function getStreak(): number {
  try {
    const raw = safeGetItem(ACTIVITY_DATES_KEY);
    if (!raw) return 0;
    const dates: string[] = JSON.parse(raw);
    let streak = 0;
    const today = new Date();
    for (let i = 0; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (dates.includes(dateStr)) streak++;
      else if (i > 0) break; // allow today to not be recorded yet
    }
    return streak;
  } catch (err) { if (import.meta.env.DEV) console.warn('[storage] getStreak', err); return 0; }
}

// ─── Data Export / Import ───

const WEEKLY_REPORTS_KEY = 'threadlog_weekly_reports';

const DATA_KEYS = [LOGS_KEY, PROJECTS_KEY, MASTER_NOTES_KEY, TODOS_KEY, LOG_SUMMARIES_KEY, MN_HISTORY_KEY, WEEKLY_REPORTS_KEY, KNOWLEDGE_BASE_KEY] as const;

export interface LoreBackup {
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export function exportAllData(): LoreBackup {
  const data: Record<string, unknown[]> = {};
  for (const key of DATA_KEYS) {
    const raw = safeGetItem(key);
    if (raw) {
      try { data[key] = JSON.parse(raw); } catch (err) { if (import.meta.env.DEV) console.warn('[storage] exportAllData parse', err); }
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
      const raw = safeGetItem(key);
      let existing: Record<string, unknown>[] = [];
      if (raw) {
        try { existing = JSON.parse(raw); } catch (err) { if (import.meta.env.DEV) console.warn('[storage] importData parse', err); }
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
  // Invalidate all caches since import may have written to any key
  invalidateLogsCache();
  invalidateProjectsCache();
  invalidateTodosCache();
  invalidateMasterNotesCache();
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
    const val = safeGetItem(key);
    if (val) {
      // Each char in JS string = 2 bytes in memory, but localStorage uses UTF-16
      totalBytes += (key.length + val.length) * 2;
    }
  }
  // Also count settings keys
  const settingsKeys = [LANG_KEY, THEME_KEY, 'threadlog_provider', 'threadlog_migration_v2'];
  for (const key of settingsKeys) {
    const val = safeGetItem(key);
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

// ─── Trash helpers ───

/** Purge items trashed more than 30 days ago from all stores (with cascade) */
export function purgeExpiredTrash(): void {
  const now = Date.now();

  // Logs — use deleteLog() for cascade cleanup
  const rawLogs = safeGetItem(LOGS_KEY);
  if (rawLogs) {
    try {
      const logs: LogEntry[] = JSON.parse(rawLogs);
      const expired = logs.filter((l) => l.trashedAt && now - l.trashedAt >= TRASH_RETENTION_MS);
      for (const l of expired) deleteLog(l.id);
    } catch (err) { if (import.meta.env.DEV) console.warn('[storage] purgeExpiredTrash logs', err); }
  }

  // Projects — use deleteProject() for cascade cleanup
  const rawProjects = safeGetItem(PROJECTS_KEY);
  if (rawProjects) {
    try {
      const projects: Project[] = JSON.parse(rawProjects);
      const expired = projects.filter((p) => p.trashedAt && now - p.trashedAt >= TRASH_RETENTION_MS);
      for (const p of expired) deleteProject(p.id);
    } catch (err) { if (import.meta.env.DEV) console.warn('[storage] purgeExpiredTrash projects', err); }
  }

  // Todos — simple removal (no cascade needed)
  const rawTodos = safeGetItem(TODOS_KEY);
  if (rawTodos) {
    try {
      const todos: Todo[] = JSON.parse(rawTodos);
      const kept = todos.filter((t) => !t.trashedAt || now - t.trashedAt < TRASH_RETENTION_MS);
      if (kept.length !== todos.length) { safeSetItem(TODOS_KEY, JSON.stringify(kept)); invalidateTodosCache(); }
    } catch (err) { if (import.meta.env.DEV) console.warn('[storage] purgeExpiredTrash todos', err); }
  }
}
