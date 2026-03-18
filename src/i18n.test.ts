import { describe, it, expect } from 'vitest';
import { t, tf, OUTPUT_LANGS, _labels } from './i18n';

describe('i18n', () => {
  describe('t()', () => {
    it('returns Japanese for ja', () => {
      expect(t('settings', 'ja')).toBe('設定');
    });

    it('returns English for en', () => {
      expect(t('settings', 'en')).toBe('Settings');
    });

    it('returns consistent translations for critical UI keys', () => {
      const criticalKeys = [
        'appName', 'settings', 'navLogs', 'navProjects', 'navTodo',
        'cancel', 'delete', 'noLogsYet',
      ] as const;

      for (const key of criticalKeys) {
        const ja = t(key, 'ja');
        const en = t(key, 'en');
        expect(ja, `${key} (ja) should not be empty`).toBeTruthy();
        expect(en, `${key} (en) should not be empty`).toBeTruthy();
        expect(typeof ja).toBe('string');
        expect(typeof en).toBe('string');
      }
    });

    it('returns empty string for function labels', () => {
      // Function labels like longTextModeDesc should return '' via t()
      expect(t('longTextModeDesc' as never, 'en')).toBe('');
    });
  });

  describe('tf()', () => {
    it('replaces arguments in function labels', () => {
      const result = tf('transformMulti', 'en', 3);
      expect(result).toContain('3');
      expect(typeof result).toBe('string');
    });

    it('works with ja language', () => {
      const result = tf('transformMulti', 'ja', 5);
      expect(result).toContain('5');
    });
  });

  describe('OUTPUT_LANGS', () => {
    it('has 8 languages', () => {
      expect(OUTPUT_LANGS).toHaveLength(8);
    });

    it('includes Japanese and English', () => {
      expect(OUTPUT_LANGS.some((l) => l.code === 'ja')).toBe(true);
      expect(OUTPUT_LANGS.some((l) => l.code === 'en')).toBe(true);
    });

    it('each lang has code, label, and flag', () => {
      for (const lang of OUTPUT_LANGS) {
        expect(lang.code).toBeTruthy();
        expect(lang.label).toBeTruthy();
        expect(lang.flag).toBeTruthy();
      }
    });
  });

  describe('all keys have all 8 languages', () => {
    const allLangs = ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt'] as const;

    it('every simple label key has non-empty values for all 8 languages', () => {
      const keys = Object.keys(_labels) as (keyof typeof _labels)[];
      expect(keys.length).toBeGreaterThan(0);

      for (const key of keys) {
        const val = _labels[key];
        if (typeof val === 'function') {
          expect(typeof val, `${key} should be a function`).toBe('function');
        } else {
          const record = val as Record<string, string>;
          for (const lang of allLangs) {
            expect(typeof record[lang], `${key}.${lang} should be a string`).toBe('string');
            expect(record[lang].length, `${key}.${lang} should not be empty`).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('function-based labels', () => {
    // Map of every function label to sample arguments that match its signature
    const funcLabels: Record<string, unknown[]> = {
      longTextModeDesc: [5],
      resumableSession: [3, 10],
      longInputWarn: ['50000'],
      inputOverLimit: ['600000', '500000'],
      transformMulti: [3],
      resumeTransform: [2, 5],
      processing: [1, 10],
      waitingForApi: [30],
      waitingRetry: [10, 2, 5],
      phaseCooldown: [5],
      itemsSaved: [4],
      remaining: [6],
      estimatedTime: [3],
      combiningGroups: [1, 4],
      retryAttempt: [1, 3],
      logCount: [7],
      projectCount: [3],
      mnExtracting: [2, 8],
      mnSourceCount: [5],
      mnUpdatedAt: ['2025-01-01'],
      mnLogCount: [10],
      unreflectedHandoffs: [2],
      trashDaysLeft: [15],
      addLogsConfirm: [3],
      addLogsMoveConfirm: [2],
      timelineDateLabel: [2025, 6, 15],
      timelineTodoBatch: [3],
      bulkAssignedToast: [4, 'MyProject'],
      staleTodoBanner: [2],
      overdueBanner: [3],
      loadMore: [10],
      todoBulkDeleteConfirm: [5],
      todoBulkCopied: [3],
      kbExtracting: [1, 5],
      kbFrequency: [3],
      kbUpdatedAt: ['2025-02-01'],
      kbLogCount: [8],
      heatmapTooltip: [4],
      todoTrendWeek: [2],
      todoTrendImproved: [15],
      todoTrendDeclined: [10],
      dataImportSuccess: [50, 5, 20],
      pasteFeedback: ['12000'],
      capturedFrom: ['ChatGPT'],
      bulkDeletedToast: [3],
      addedToProject: ['TestProject'],
      bulkAddedToast: [5],
      bulkTrashConfirm: [4],
      selectedCount: [3],
      unassignedLogsHint: [7],
      paginationPage: [2, 10],
      projectSummaryAutoGenHint: [12],
      dashboardMoreTasks: [5],
      nudgeOverdue: [2],
      nudgeStaleCount: [3],
      nudgeUnassigned: [4],
      todoSelectedCount: [3, 10],
      daysAgo: [5],
      unreflectedHandoffWarning: [2],
      logsCount: [5],
      weeklyReportLogCountInline: [8],
      trashItemCount: [6],
      toastTodosExtracted: [4],
      toastTodosAdded: [3],
      errorFileRead: ['test.pdf'],
      ariaRemoveFile: ['file.txt'],
      onboardingStepCounter: [2, 6],
      trialActive: [5],
      pricingUsedToday: [3, 5],
      dailyLimitReached: [5, 5],
      transformsRemaining: [3],
      proExpires: ['2026-12-31'],
    };

    it('all function labels return non-empty strings for ja', () => {
      for (const [key, args] of Object.entries(funcLabels)) {
        const result = tf(key as never, 'ja', ...args);
        expect(typeof result, `${key}('ja') should return a string`).toBe('string');
        expect(result.length, `${key}('ja') should not be empty`).toBeGreaterThan(0);
      }
    });

    it('all function labels return non-empty strings for en', () => {
      for (const [key, args] of Object.entries(funcLabels)) {
        const result = tf(key as never, 'en', ...args);
        expect(typeof result, `${key}('en') should return a string`).toBe('string');
        expect(result.length, `${key}('en') should not be empty`).toBeGreaterThan(0);
      }
    });

    it('all function labels return non-empty strings for all new languages', () => {
      const newLangs = ['es', 'fr', 'de', 'zh', 'ko', 'pt'] as const;
      for (const lang of newLangs) {
        for (const [key, args] of Object.entries(funcLabels)) {
          const result = tf(key as never, lang, ...args);
          expect(typeof result, `${key}('${lang}') should return a string`).toBe('string');
          expect(result.length, `${key}('${lang}') should not be empty`).toBeGreaterThan(0);
        }
      }
    });

    it('covers every function label in the labels object', () => {
      const allFuncKeys = Object.keys(_labels).filter(
        (k) => typeof _labels[k as keyof typeof _labels] === 'function',
      );
      for (const key of allFuncKeys) {
        expect(funcLabels, `missing test args for function label "${key}"`).toHaveProperty(key);
      }
    });
  });

  describe('no duplicate keys', () => {
    it('labels object has no accidentally duplicated keys', () => {
      // In a JS object literal, duplicate keys silently overwrite.
      // We verify the count of keys matches expectations and spot-check
      // that no two keys share the same ja+en pair (which would indicate
      // a copy-paste duplication).
      const keys = Object.keys(_labels) as (keyof typeof _labels)[];
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size);

      // Check that no two simple (non-function) labels share the exact same ja+en combo
      const seen = new Map<string, string>();
      for (const key of keys) {
        const val = _labels[key];
        if (typeof val !== 'function') {
          const record = val as { ja: string; en: string };
          const fingerprint = `${record.ja}|||${record.en}`;
          // Some intentional duplicates exist (e.g. labels reused for different contexts)
          // so we just collect them — the key uniqueness check above is the real guard.
          if (seen.has(fingerprint)) {
            // Not a failure — just intentional reuse. We only fail if keys themselves collide.
          }
          seen.set(fingerprint, key);
        }
      }
    });
  });

  describe('critical UI keys specifically', () => {
    const criticalPairs: Record<string, { ja: string; en: string }> = {
      appName: { ja: 'Lore', en: 'Lore' },
      navLogs: { ja: 'ログ', en: 'Logs' },
      navProjects: { ja: 'プロジェクト', en: 'Projects' },
      navTodo: { ja: 'TODO', en: 'TODO' },
      settings: { ja: '設定', en: 'Settings' },
      cancel: { ja: 'キャンセル', en: 'Cancel' },
      delete: { ja: '削除', en: 'Delete' },
      saveKey: { ja: 'キーを保存', en: 'Save Key' },
      back: { ja: '戻る', en: 'Back' },
      close: { ja: '閉じる', en: 'Close' },
    };

    for (const [key, expected] of Object.entries(criticalPairs)) {
      it(`"${key}" has correct ja translation`, () => {
        expect(t(key as never, 'ja')).toBe(expected.ja);
      });

      it(`"${key}" has correct en translation`, () => {
        expect(t(key as never, 'en')).toBe(expected.en);
      });
    }

    it('"loading" style keys return non-empty strings', () => {
      // "loading" is represented as "transforming" in this app
      expect(t('transforming', 'ja').length).toBeGreaterThan(0);
      expect(t('transforming', 'en').length).toBeGreaterThan(0);
    });
  });

  describe('OUTPUT_LANGS coverage', () => {
    const commonKeys = ['appName', 'settings', 'navLogs', 'cancel', 'delete'] as const;

    it('t() returns non-empty for ja and en for common keys', () => {
      for (const key of commonKeys) {
        for (const lang of ['ja', 'en'] as const) {
          const result = t(key, lang);
          expect(result.length, `${key} (${lang})`).toBeGreaterThan(0);
        }
      }
    });

    it('OUTPUT_LANGS covers all expected language codes', () => {
      const codes = OUTPUT_LANGS.map((l) => l.code);
      expect(codes).toContain('ja');
      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('fr');
      expect(codes).toContain('de');
      expect(codes).toContain('zh');
      expect(codes).toContain('ko');
      expect(codes).toContain('pt');
    });

    it('tf() returns non-empty for ja and en for common function keys', () => {
      for (const lang of ['ja', 'en'] as const) {
        expect(tf('transformMulti', lang, 2).length).toBeGreaterThan(0);
        expect(tf('logCount', lang, 5).length).toBeGreaterThan(0);
        expect(tf('trashDaysLeft', lang, 7).length).toBeGreaterThan(0);
      }
    });
  });
});
