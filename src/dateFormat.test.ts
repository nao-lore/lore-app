import { describe, it, expect } from 'vitest';
import { formatDateOnly, formatDateShort, formatDateFull, formatDateGroup } from './utils/dateFormat';

describe('dateFormat', () => {
  describe('formatDateOnly', () => {
    it('formats date without time', () => {
      const result = formatDateOnly('2026-03-15T14:30:00Z');
      expect(result).toMatch(/Mar 15, 2026/);
    });

    it('handles different months', () => {
      expect(formatDateOnly('2026-01-05T00:00:00Z')).toMatch(/Jan/);
      expect(formatDateOnly('2026-12-25T00:00:00Z')).toMatch(/Dec/);
    });
  });

  describe('formatDateShort', () => {
    it('shows "Today HH:MM" for today', () => {
      const now = new Date();
      const result = formatDateShort(now.toISOString());
      expect(result).toMatch(/^Today \d{2}:\d{2}$/);
    });

    it('shows "Mon D" for other dates', () => {
      const result = formatDateShort('2020-06-15T10:00:00Z');
      expect(result).toMatch(/Jun 15/);
    });
  });

  describe('formatDateFull', () => {
    it('shows "Today HH:MM" for today', () => {
      const now = new Date();
      const result = formatDateFull(now.toISOString());
      expect(result).toMatch(/^Today \d{2}:\d{2}$/);
    });

    it('shows "Mon D, YYYY" for other dates', () => {
      const result = formatDateFull('2020-06-15T10:00:00Z');
      expect(result).toMatch(/Jun 15, 2020/);
    });
  });

  describe('formatDateGroup', () => {
    it('returns "Today" for today', () => {
      const now = new Date();
      expect(formatDateGroup(now.toISOString())).toBe('Today');
    });

    it('returns "Mon D, YYYY" for other dates', () => {
      const result = formatDateGroup('2020-06-15T10:00:00Z');
      expect(result).toMatch(/Jun 15, 2020/);
    });
  });
});
