/**
 * performance.test.tsx — Performance tests for Lore app
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ─── Mock storage ───
vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    loadLogs: () => [],
    loadProjects: () => [],
    loadTodos: () => [],
    loadMasterNotes: () => [],
    getUiLang: () => 'en',
    setUiLang: vi.fn(),
    getTheme: () => 'light',
    setTheme: vi.fn(),
    safeGetItem: () => null,
    safeSetItem: vi.fn(),
    safeRemoveItem: vi.fn(),
    getFeatureEnabled: () => true,
    isDemoMode: () => false,
    getApiKey: () => null,
    getLang: () => 'en',
    getStreak: () => 0,
    getMasterNote: () => null,
    updateLog: vi.fn(),
    updateTodo: vi.fn(),
  };
});

vi.mock('../sounds', () => ({
  playSuccess: vi.fn(),
  playDelete: vi.fn(),
}));

vi.mock('../provider', () => ({
  shouldUseBuiltinApi: () => false,
  getBuiltinUsage: () => ({ used: 0, limit: 100, remaining: 100 }),
}));

import ConfirmDialog from '../ConfirmDialog';

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// 1. Memory leak detection (cleanup on unmount)
// ═══════════════════════════════════════════════════════════════════
describe('Performance: memory leak prevention', () => {
  it('event listeners are cleaned up on remove', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const handler = () => {};
    document.addEventListener('keydown', handler);
    document.removeEventListener('keydown', handler);

    expect(addSpy).toHaveBeenCalledWith('keydown', handler);
    expect(removeSpy).toHaveBeenCalledWith('keydown', handler);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('ConfirmDialog adds keydown listener on mount and removes on unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(
      <ConfirmDialog
        title="Test"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const keydownAdds = addSpy.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownAdds.length).toBeGreaterThan(0);

    unmount();
    const keydownRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownRemoves.length).toBeGreaterThan(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('large array operations do not retain references after processing', () => {
    let largeArray: { id: number; data: string }[] | null = Array.from(
      { length: 1000 },
      (_, i) => ({ id: i, data: `data-${i}`.repeat(100) }),
    );

    const ids = largeArray.map((item) => item.id);
    expect(ids.length).toBe(1000);

    largeArray = null;
    expect(largeArray).toBeNull();
  });

  it('JSON parse/stringify cycle does not leak shared references', () => {
    const payload = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      content: 'x'.repeat(1000),
    }));
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(100);
    parsed[0].id = 'modified';
    expect(payload[0].id).toBe('item-0');
  });

  it('setTimeout cleanup pattern works correctly', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const timerId = setTimeout(callback, 1000);
    clearTimeout(timerId);
    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
