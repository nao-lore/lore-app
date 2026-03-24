/**
 * useScrollPosition.test.tsx — Unit tests for the useScrollPosition hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollPosition } from '../../hooks/useScrollPosition';

// Mock requestAnimationFrame to run synchronously
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0; });

describe('useScrollPosition', () => {
  let scrollEl: HTMLDivElement;
  let scrollRef: React.RefObject<HTMLElement | null>;
  let scrollPositionRef: React.MutableRefObject<Record<string, number>>;

  beforeEach(() => {
    scrollEl = document.createElement('div');
    scrollEl.scrollTo = vi.fn();
    scrollRef = { current: scrollEl };
    scrollPositionRef = { current: {} };
  });

  it('scrolls to 0 when no saved position for view', () => {
    renderHook(() => useScrollPosition('history', null, scrollRef, scrollPositionRef));
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('restores saved scroll position for view', () => {
    scrollPositionRef.current['history'] = 250;
    renderHook(() => useScrollPosition('history', null, scrollRef, scrollPositionRef));
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(0, 250);
  });

  it('uses detail:id key for detail view', () => {
    scrollPositionRef.current['detail:log-123'] = 400;
    renderHook(() => useScrollPosition('detail', 'log-123', scrollRef, scrollPositionRef));
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(0, 400);
  });

  it('uses view key (not selectedId) for non-detail views', () => {
    scrollPositionRef.current['history'] = 100;
    scrollPositionRef.current['detail:some-id'] = 999;
    renderHook(() => useScrollPosition('history', 'some-id', scrollRef, scrollPositionRef));
    // Should use 'history' key, not 'detail:some-id'
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(0, 100);
  });

  it('handles null scrollRef gracefully', () => {
    const nullRef = { current: null };
    // Should not throw
    expect(() => {
      renderHook(() => useScrollPosition('history', null, nullRef, scrollPositionRef));
    }).not.toThrow();
  });

  it('re-scrolls when view changes', () => {
    scrollPositionRef.current['history'] = 100;
    scrollPositionRef.current['settings'] = 200;

    const { rerender } = renderHook(
      ({ view }) => useScrollPosition(view, null, scrollRef, scrollPositionRef),
      { initialProps: { view: 'history' as const } },
    );

    expect(scrollEl.scrollTo).toHaveBeenLastCalledWith(0, 100);

    rerender({ view: 'settings' as const });
    expect(scrollEl.scrollTo).toHaveBeenLastCalledWith(0, 200);
  });
});
