import { describe, it, expect } from 'vitest';
import { t, tf, OUTPUT_LANGS } from './i18n';

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
});
