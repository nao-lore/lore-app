/**
 * usePullToRefresh.test.tsx — Unit tests for the usePullToRefresh hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

// Helper to create a minimal React.TouchEvent
function makeTouchEvent(clientY: number, currentTarget?: HTMLElement): React.TouchEvent {
  return {
    touches: [{ clientY }],
    currentTarget: currentTarget || document.createElement('div'),
  } as unknown as React.TouchEvent;
}

describe('usePullToRefresh — initial state', () => {
  it('starts with pullDistance 0 and refreshing false', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    expect(result.current.pullDistance).toBe(0);
    expect(result.current.refreshing).toBe(false);
  });

  it('has no indicator style initially', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    expect(result.current.indicatorStyle).toBeUndefined();
  });
});

describe('usePullToRefresh — touch interactions', () => {
  it('sets pulling state on touchStart when scrollTop is 0', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, el));
    });

    // Pull state is internal, but we can verify via touch move behavior
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(150));
    });

    expect(result.current.pullDistance).toBeGreaterThan(0);
  });

  it('does not pull when scrollTop > 0', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 100 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, el));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200));
    });

    expect(result.current.pullDistance).toBe(0);
  });

  it('applies damping (pullDistance < raw diff)', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, el));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200));
    });

    // Raw diff is 100, damping is 0.5x, so should be 50
    expect(result.current.pullDistance).toBe(50);
  });

  it('caps pull distance at threshold * 1.5', () => {
    const onRefresh = vi.fn();
    const threshold = 80;
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(0, el));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(500));
    });

    expect(result.current.pullDistance).toBeLessThanOrEqual(threshold * 1.5);
  });

  it('does not increase pullDistance for upward movement', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, el));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(100));
    });

    expect(result.current.pullDistance).toBe(0);
  });
});

describe('usePullToRefresh — refresh trigger', () => {
  it('calls onRefresh when pull exceeds threshold on touchEnd', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const threshold = 80;
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(0, el));
    });

    // Pull enough: threshold is 80, with 0.5 damping we need 160+ raw diff
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200));
    });

    expect(result.current.pullDistance).toBeGreaterThanOrEqual(threshold);

    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not call onRefresh when pull is below threshold', async () => {
    const onRefresh = vi.fn();
    const threshold = 80;
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, el));
    });

    // Small pull: 30px diff * 0.5 = 15 < 80
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(130));
    });

    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('resets pullDistance after touchEnd', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(0, el));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200));
    });

    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(result.current.pullDistance).toBe(0);
  });

  it('shows indicator style when pull distance > 0', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0 });

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(0, el));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(100));
    });

    expect(result.current.indicatorStyle).toBeDefined();
    expect(result.current.indicatorStyle!.display).toBe('flex');
    expect(result.current.indicatorStyle!.height).toBeGreaterThan(0);
  });
});
