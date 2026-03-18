import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((_i: number) => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import { isPro, setPro, getProExpiryDate, setProExpiryDate, setProFromCheckout, getProSessionId, checkProStatus } from '../utils/proManager';

describe('proManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('isPro / setPro', () => {
    it('returns false by default', () => {
      expect(isPro()).toBe(false);
    });

    it('returns true after setPro(true)', () => {
      setPro(true);
      expect(isPro()).toBe(true);
    });

    it('returns false after setPro(false)', () => {
      setPro(true);
      setPro(false);
      expect(isPro()).toBe(false);
    });

    it('clears expiry and session when deactivating', () => {
      setProFromCheckout('sess_123');
      expect(getProExpiryDate()).not.toBeNull();
      expect(getProSessionId()).toBe('sess_123');

      setPro(false);
      expect(getProExpiryDate()).toBeNull();
      expect(getProSessionId()).toBeNull();
    });
  });

  describe('expiry logic', () => {
    it('returns false when Pro is expired', () => {
      setPro(true);
      // Set expiry to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setProExpiryDate(yesterday.toISOString());

      expect(isPro()).toBe(false);
    });

    it('returns true when Pro has not expired', () => {
      setPro(true);
      // Set expiry to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setProExpiryDate(tomorrow.toISOString());

      expect(isPro()).toBe(true);
    });

    it('returns the expiry date as ISO string', () => {
      const date = '2026-12-31T00:00:00.000Z';
      setProExpiryDate(date);
      expect(getProExpiryDate()).toBe(date);
    });

    it('returns null for expiry when not set', () => {
      expect(getProExpiryDate()).toBeNull();
    });
  });

  describe('setProFromCheckout', () => {
    it('activates Pro with 30-day expiry', () => {
      setProFromCheckout('cs_test_123');
      expect(isPro()).toBe(true);
      expect(getProSessionId()).toBe('cs_test_123');

      const expiry = getProExpiryDate();
      expect(expiry).not.toBeNull();

      // Expiry should be ~30 days from now
      const expiryDate = new Date(expiry!);
      const now = new Date();
      const diffDays = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });
  });

  describe('checkProStatus', () => {
    it('returns { isPro: false } when not active', () => {
      expect(checkProStatus()).toEqual({ isPro: false });
    });

    it('returns isPro: true with expiresAt when active', () => {
      setProFromCheckout('sess_456');
      const status = checkProStatus();
      expect(status.isPro).toBe(true);
      expect(status.expiresAt).toBeDefined();
    });

    it('returns isPro: false when expired', () => {
      setPro(true);
      const past = new Date();
      past.setDate(past.getDate() - 1);
      setProExpiryDate(past.toISOString());

      const status = checkProStatus();
      expect(status.isPro).toBe(false);
    });
  });

  describe('getProSessionId', () => {
    it('returns null when not set', () => {
      expect(getProSessionId()).toBeNull();
    });

    it('returns the session ID after checkout', () => {
      setProFromCheckout('cs_test_789');
      expect(getProSessionId()).toBe('cs_test_789');
    });
  });
});
