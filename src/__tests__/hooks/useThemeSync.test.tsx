/**
 * useThemeSync.test.tsx — Unit tests for the useThemeSync hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock matchMedia
let darkMode = false;
const listeners: Array<(e: { matches: boolean }) => void> = [];
vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
  matches: query === '(prefers-color-scheme: dark)' ? darkMode : false,
  media: query,
  addEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
    listeners.push(handler);
  },
  removeEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
    const idx = listeners.indexOf(handler);
    if (idx >= 0) listeners.splice(idx, 1);
  },
})));

import { useThemeSync } from '../../hooks/useThemeSync';

describe('useThemeSync — theme attribute', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
    darkMode = false;
    listeners.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets data-theme to light for light preference', () => {
    renderHook(() => useThemeSync('light', 'en'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme to dark for dark preference', () => {
    renderHook(() => useThemeSync('dark', 'en'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-theme to high-contrast for high-contrast preference', () => {
    renderHook(() => useThemeSync('high-contrast', 'en'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
  });

  it('resolves system preference to light when prefers-color-scheme is light', () => {
    darkMode = false;
    renderHook(() => useThemeSync('system', 'en'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves system preference to dark when prefers-color-scheme is dark', () => {
    darkMode = true;
    renderHook(() => useThemeSync('system', 'en'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('updates data-theme when preference changes', () => {
    const { rerender } = renderHook(
      ({ theme, lang }) => useThemeSync(theme, lang),
      { initialProps: { theme: 'light' as const, lang: 'en' as const } },
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    rerender({ theme: 'dark' as const, lang: 'en' as const });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('registers media query listener for system theme and cleans up', () => {
    darkMode = false;
    const { unmount } = renderHook(() => useThemeSync('system', 'en'));
    // System mode should register a listener
    expect(listeners.length).toBeGreaterThanOrEqual(1);

    const listenerCountBeforeUnmount = listeners.length;
    unmount();
    // Listener should be removed on cleanup
    expect(listeners.length).toBeLessThan(listenerCountBeforeUnmount);
  });
});

describe('useThemeSync — lang/dir attributes', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
    darkMode = false;
    listeners.length = 0;
  });

  it('sets html lang attribute to current language', () => {
    renderHook(() => useThemeSync('light', 'ja'));
    expect(document.documentElement.lang).toBe('ja');
  });

  it('sets dir to ltr for non-RTL languages', () => {
    renderHook(() => useThemeSync('light', 'en'));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('sets dir to ltr for Japanese', () => {
    renderHook(() => useThemeSync('light', 'ja'));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('updates lang when language changes', () => {
    const { rerender } = renderHook(
      ({ theme, lang }) => useThemeSync(theme, lang),
      { initialProps: { theme: 'light' as const, lang: 'en' as const } },
    );
    expect(document.documentElement.lang).toBe('en');

    rerender({ theme: 'light' as const, lang: 'ko' as const });
    expect(document.documentElement.lang).toBe('ko');
  });
});
