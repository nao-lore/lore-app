/**
 * useSidebarState.test.tsx — Unit tests for the useSidebarState hook
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

import { useSidebarState } from '../../hooks/useSidebarState';

describe('useSidebarState — initial state', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults to sidebarOpen=true and sidebarHidden=false when no saved state', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.sidebarOpen).toBe(true);
    expect(result.current.sidebarHidden).toBe(false);
  });

  it('initializes sidebarOpen=false when saved as collapsed', () => {
    store.set('threadlog_sidebar', 'collapsed');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.sidebarHidden).toBe(false);
  });

  it('initializes sidebarOpen=false and sidebarHidden=true when saved as hidden', () => {
    store.set('threadlog_sidebar', 'hidden');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.sidebarHidden).toBe(true);
  });

  it('initializes sidebarOpen=true for any other saved value', () => {
    store.set('threadlog_sidebar', 'open');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.sidebarOpen).toBe(true);
    expect(result.current.sidebarHidden).toBe(false);
  });
});

describe('useSidebarState — handleCollapseSidebar', () => {
  beforeEach(() => {
    store.clear();
  });

  it('sets sidebarOpen to false', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.sidebarOpen).toBe(true);

    act(() => { result.current.handleCollapseSidebar(); });
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('persists collapsed to localStorage', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => { result.current.handleCollapseSidebar(); });
    expect(store.get('threadlog_sidebar')).toBe('collapsed');
  });

  it('does not set sidebarHidden to true', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => { result.current.handleCollapseSidebar(); });
    expect(result.current.sidebarHidden).toBe(false);
  });
});

describe('useSidebarState — handleHideSidebar', () => {
  beforeEach(() => {
    store.clear();
  });

  it('sets sidebarOpen to false and sidebarHidden to true', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => { result.current.handleHideSidebar(); });
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.sidebarHidden).toBe(true);
  });

  it('persists hidden to localStorage', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => { result.current.handleHideSidebar(); });
    expect(store.get('threadlog_sidebar')).toBe('hidden');
  });
});

describe('useSidebarState — state transitions', () => {
  beforeEach(() => {
    store.clear();
  });

  it('collapse then hide produces correct state', () => {
    const { result } = renderHook(() => useSidebarState());

    act(() => { result.current.handleCollapseSidebar(); });
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.sidebarHidden).toBe(false);

    act(() => { result.current.handleHideSidebar(); });
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.sidebarHidden).toBe(true);
  });

  it('setSidebarOpen can reopen after collapse', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => { result.current.handleCollapseSidebar(); });
    expect(result.current.sidebarOpen).toBe(false);

    act(() => { result.current.setSidebarOpen(true); });
    expect(result.current.sidebarOpen).toBe(true);
  });

  it('setSidebarHidden can unhide after hide', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => { result.current.handleHideSidebar(); });
    expect(result.current.sidebarHidden).toBe(true);

    act(() => { result.current.setSidebarHidden(false); });
    expect(result.current.sidebarHidden).toBe(false);
  });

  it('exposes SIDEBAR_KEY constant', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.SIDEBAR_KEY).toBe('threadlog_sidebar');
  });
});
