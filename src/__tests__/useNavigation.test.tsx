/**
 * useNavigation.test.tsx — Unit tests for the useNavigation hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

// Mock loadLogs — default returns empty (new user)
let mockLogs: unknown[] = [];
vi.mock('../storage', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    loadLogs: () => mockLogs,
  };
});

import { useNavigation } from '../hooks/useNavigation';

describe('useNavigation — view navigation', () => {
  beforeEach(() => {
    store.clear();
    mockLogs = [];
  });

  it('initializes to input view for new users (no logs)', () => {
    const { result } = renderHook(() => useNavigation());
    expect(result.current.view).toBe('input');
  });

  it('initializes to dashboard view when logs exist', () => {
    mockLogs = [{ id: '1', title: 'test' }];
    const { result } = renderHook(() => useNavigation());
    expect(result.current.view).toBe('dashboard');
  });

  it('initializes from saved last view', () => {
    store.set('threadlog_last_view', 'history');
    const { result } = renderHook(() => useNavigation());
    expect(result.current.view).toBe('history');
  });

  it('does not restore detail as initial view', () => {
    store.set('threadlog_last_view', 'detail');
    const { result } = renderHook(() => useNavigation());
    // Falls back to input (no logs) or dashboard (with logs)
    expect(['input', 'dashboard']).toContain(result.current.view);
  });

  it('does not restore masternote as initial view', () => {
    store.set('threadlog_last_view', 'masternote');
    const { result } = renderHook(() => useNavigation());
    expect(['input', 'dashboard']).toContain(result.current.view);
  });

  it('goTo changes view', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goTo('settings'); });
    expect(result.current.view).toBe('settings');
  });

  it('goTo sets prevView', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goTo('history'); });
    // prevView is whatever the initial view was
    expect(result.current.prevView).toBe('input');
  });

  it('goToRaw changes view without dirty guard', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goToRaw('todos'); });
    expect(result.current.view).toBe('todos');
  });

  it('handleNewLog resets to input view and clears selectedId', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goTo('history'); });
    act(() => { result.current.handleNewLog(); });
    expect(result.current.view).toBe('input');
    expect(result.current.selectedId).toBeNull();
  });

  it('handleSelect sets selectedId and navigates to detail', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.handleSelect('log-123'); });
    expect(result.current.selectedId).toBe('log-123');
    expect(result.current.view).toBe('detail');
  });

  it('goHome resets to input', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goTo('settings'); });
    act(() => { result.current.goHome(); });
    expect(result.current.view).toBe('input');
    expect(result.current.selectedId).toBeNull();
  });
});

describe('useNavigation — dirty state guard', () => {
  beforeEach(() => { store.clear(); mockLogs = []; });

  it('goTo is blocked when input is dirty and sets pendingNav', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goToRaw('input'); });
    act(() => { result.current.setInputDirty(true); });
    act(() => { result.current.goTo('history'); });
    // Should still be on input because dirty guard blocked
    expect(result.current.view).toBe('input');
    expect(result.current.pendingNav).not.toBeNull();
  });

  it('clearInputDirty allows navigation after', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goToRaw('input'); });
    act(() => { result.current.setInputDirty(true); });
    act(() => { result.current.clearInputDirty(); });
    act(() => { result.current.goTo('history'); });
    expect(result.current.view).toBe('history');
  });

  it('goTo to input view is not blocked even when dirty', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goToRaw('input'); });
    act(() => { result.current.setInputDirty(true); });
    act(() => { result.current.goTo('input'); });
    expect(result.current.view).toBe('input');
  });
});

describe('useNavigation — back navigation', () => {
  beforeEach(() => { store.clear(); mockLogs = []; });

  it('handleBack returns to prevView', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goTo('settings'); });
    act(() => { result.current.goTo('todos'); });
    act(() => { result.current.handleBack(null); });
    expect(result.current.view).toBe('settings');
  });

  it('handleBack from detail goes to history when no active project', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => { result.current.goTo('history'); });
    act(() => { result.current.handleSelect('log-1'); });
    act(() => { result.current.handleBack(null); });
    expect(result.current.view).toBe('history');
  });

  it('handleBack from detail goes to projecthome when prevView is detail', () => {
    const { result } = renderHook(() => useNavigation());
    // Simulate: detail -> detail (e.g. navigating between logs)
    act(() => { result.current.handleSelect('log-1'); });
    // Now prevView is 'input', view is 'detail'
    // Navigate to another detail to make prevView 'detail'
    act(() => { result.current.handleSelect('log-2'); });
    // Now prevView is 'detail'
    act(() => { result.current.handleBack('proj-1'); });
    expect(result.current.view).toBe('projecthome');
  });
});
