/**
 * storage-settings.test.ts — Unit tests for settings storage module
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
  getApiKey,
  setApiKey,
  getLang,
  setLang,
  getFeatureEnabled,
  setFeatureEnabled,
  isDemoMode,
  setDemoMode,
  exportAllData,
  validateBackup,
  importData,
  getTheme,
  setTheme,
  getUiLang,
  setUiLang,
  getDataUsage,
  formatBytes,
  getAutoReportSetting,
  setAutoReportSetting,
  getLastReportDate,
  setLastReportDate,
  getStreak,
  recordActivity,
  invalidateLogsCache,
  invalidateProjectsCache,
  invalidateTodosCache,
  invalidateMasterNotesCache,
} from '../storage';

describe('storage/settings — API key', () => {
  beforeEach(() => store.clear());

  it('getApiKey returns empty string when not set', () => {
    expect(getApiKey()).toBe('');
  });

  it('setApiKey and getApiKey round-trip', () => {
    setApiKey('sk-test-123');
    expect(getApiKey()).toBe('sk-test-123');
  });

  it('API key is provider-scoped (default gemini)', () => {
    setApiKey('key1');
    expect(store.get('threadlog_api_key_gemini')).toBe('key1');
  });

  it('API key respects active provider', () => {
    store.set('threadlog_provider', 'openai');
    setApiKey('openai-key');
    expect(store.get('threadlog_api_key_openai')).toBe('openai-key');
  });
});

describe('storage/settings — language', () => {
  beforeEach(() => store.clear());

  it('getLang returns auto when not set', () => {
    expect(getLang()).toBe('auto');
  });

  it('setLang and getLang round-trip', () => {
    setLang('ja');
    expect(getLang()).toBe('ja');
  });

  it('getLang returns auto for invalid lang', () => {
    store.set('threadlog_lang', 'invalid');
    expect(getLang()).toBe('auto');
  });

  it('getLang accepts valid languages', () => {
    for (const lang of ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt']) {
      setLang(lang);
      expect(getLang()).toBe(lang);
    }
  });

  it('getUiLang returns en when not set', () => {
    expect(getUiLang()).toBe('en');
  });

  it('setUiLang and getUiLang round-trip', () => {
    setUiLang('ja');
    expect(getUiLang()).toBe('ja');
  });
});

describe('storage/settings — theme', () => {
  beforeEach(() => store.clear());

  it('getTheme returns dark when not set', () => {
    expect(getTheme()).toBe('dark');
  });

  it('setTheme and getTheme round-trip', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
  });

  it('getTheme returns dark for invalid value', () => {
    store.set('threadlog_theme', 'neon');
    expect(getTheme()).toBe('dark');
  });

  it('all valid themes are accepted', () => {
    for (const theme of ['light', 'dark', 'system', 'high-contrast'] as const) {
      setTheme(theme);
      expect(getTheme()).toBe(theme);
    }
  });
});

describe('storage/settings — demo mode', () => {
  beforeEach(() => store.clear());

  it('isDemoMode returns false when not set', () => {
    expect(isDemoMode()).toBe(false);
  });

  it('setDemoMode(true) enables demo mode', () => {
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
  });

  it('setDemoMode(false) disables demo mode', () => {
    setDemoMode(true);
    setDemoMode(false);
    expect(isDemoMode()).toBe(false);
  });
});

describe('storage/settings — feature toggles', () => {
  beforeEach(() => store.clear());

  it('getFeatureEnabled returns default when not set', () => {
    expect(getFeatureEnabled('newFeature')).toBe(true);
    expect(getFeatureEnabled('newFeature', false)).toBe(false);
  });

  it('setFeatureEnabled and getFeatureEnabled round-trip', () => {
    setFeatureEnabled('test', false);
    expect(getFeatureEnabled('test')).toBe(false);
    setFeatureEnabled('test', true);
    expect(getFeatureEnabled('test')).toBe(true);
  });
});

describe('storage/settings — auto report', () => {
  beforeEach(() => store.clear());

  it('getAutoReportSetting returns false when not set', () => {
    expect(getAutoReportSetting()).toBe(false);
  });

  it('setAutoReportSetting and get round-trip', () => {
    setAutoReportSetting(true);
    expect(getAutoReportSetting()).toBe(true);
  });

  it('getLastReportDate returns null when not set', () => {
    expect(getLastReportDate()).toBeNull();
  });

  it('setLastReportDate and get round-trip', () => {
    const ts = Date.now();
    setLastReportDate(ts);
    expect(getLastReportDate()).toBe(ts);
  });
});

describe('storage/settings — export / import / validate', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('exportAllData returns valid backup structure', () => {
    const backup = exportAllData();
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeTruthy();
    expect(typeof backup.data).toBe('object');
  });

  it('validateBackup accepts valid backup', () => {
    const backup = exportAllData();
    expect(validateBackup(backup)).toBe(true);
  });

  it('validateBackup rejects non-object', () => {
    expect(validateBackup(null)).toBe(false);
    expect(validateBackup('string')).toBe(false);
    expect(validateBackup(42)).toBe(false);
  });

  it('validateBackup rejects wrong version', () => {
    expect(validateBackup({ version: 2, data: {} })).toBe(false);
  });

  it('validateBackup rejects non-array data values', () => {
    expect(validateBackup({ version: 1, data: { key: 'not-array' } })).toBe(false);
  });

  it('importData in overwrite mode replaces data', () => {
    store.set('threadlog_logs', JSON.stringify([{ id: 'old' }]));
    invalidateLogsCache();
    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      data: {
        threadlog_logs: [{ id: 'new1' }, { id: 'new2' }],
      },
    };
    const result = importData(backup, 'overwrite');
    expect(result.logs).toBe(2);
  });

  it('importData in merge mode merges by id', () => {
    store.set('threadlog_logs', JSON.stringify([{ id: 'existing', title: 'Old' }]));
    invalidateLogsCache();
    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      data: {
        threadlog_logs: [{ id: 'existing', title: 'Updated' }, { id: 'brand-new' }],
      },
    };
    const result = importData(backup, 'merge');
    expect(result.logs).toBe(2);
  });
});

describe('storage/settings — data usage & formatting', () => {
  beforeEach(() => store.clear());

  it('getDataUsage returns zero for empty storage', () => {
    const usage = getDataUsage();
    expect(usage.usedBytes).toBe(0);
    expect(usage.percentage).toBe(0);
  });

  it('getDataUsage increases with data', () => {
    store.set('threadlog_logs', JSON.stringify([{ id: 'x' }]));
    const usage = getDataUsage();
    expect(usage.usedBytes).toBeGreaterThan(0);
  });

  it('formatBytes handles bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formatBytes handles kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formatBytes handles megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
});

describe('storage/settings — streak', () => {
  beforeEach(() => store.clear());

  it('getStreak returns 0 when no activity', () => {
    expect(getStreak()).toBe(0);
  });

  it('recordActivity and getStreak records today', () => {
    recordActivity();
    expect(getStreak()).toBeGreaterThanOrEqual(1);
  });

  it('recordActivity is idempotent for same day', () => {
    recordActivity();
    recordActivity();
    const raw = JSON.parse(store.get('threadlog_activity_dates')!);
    const today = new Date().toISOString().slice(0, 10);
    expect(raw.filter((d: string) => d === today)).toHaveLength(1);
  });
});
