/**
 * useSwipeAction.test.tsx — Unit tests for the useSwipeAction hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeAction } from '../../hooks/useSwipeAction';

function makeTouchEvent(clientX: number, clientY: number): React.TouchEvent {
  return {
    touches: [{ clientX, clientY }],
  } as unknown as React.TouchEvent;
}

describe('useSwipeAction — initial state', () => {
  it('starts with no offset and correct default styles', () => {
    const { result } = renderHook(() => useSwipeAction({}));
    expect(result.current.itemStyle.transform).toBe('translateX(0)');
    expect(result.current.containerStyle.position).toBe('relative');
    expect(result.current.leftBg).toBeNull();
    expect(result.current.rightBg).toBeNull();
  });
});

describe('useSwipeAction — horizontal swipe detection', () => {
  it('tracks horizontal swipe with damping', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    // Move left by 50px (horizontal dominates, > 10px threshold)
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(150, 100));
    });

    // Offset should be -50 * 0.6 = -30
    expect(result.current.itemStyle.transform).toBe('translateX(-30px)');
  });

  it('cancels swipe if vertical movement dominates', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    // Move vertically more than horizontally (dy=50 > dx=5)
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(195, 150));
    });

    expect(result.current.itemStyle.transform).toBe('translateX(0)');
  });

  it('does not track right swipe when no onSwipeRight handler', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, 100));
    });

    // Attempt right swipe - should be blocked (no onSwipeRight)
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200, 100));
    });

    // No offset for blocked direction
    expect(result.current.itemStyle.transform).toContain('0');
  });

  it('does not track left swipe when no onSwipeLeft handler', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeRight }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    // Attempt left swipe - should be blocked
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(100, 100));
    });

    expect(result.current.itemStyle.transform).toContain('0');
  });
});

describe('useSwipeAction — swipe triggers', () => {
  it('calls onSwipeLeft when threshold is exceeded', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft, threshold: 50 }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(300, 100));
    });

    // Move left enough: need offset < -50. With 0.6 damping, need raw dx >= 84
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200, 100));
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('calls onSwipeRight when threshold is exceeded', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeRight, threshold: 50 }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, 100));
    });

    // Move right: 100px * 0.6 = 60 > 50 threshold
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(200, 100));
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('does not trigger when below threshold', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft, threshold: 100 }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    // Small swipe: 30px * 0.6 = 18, well below 100 threshold
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(170, 100));
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('resets offset and swiping state after touchEnd', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(100, 100));
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    // After touchEnd, should have transition and be at 0
    expect(result.current.itemStyle.transform).toBe('translateX(0)');
    expect(result.current.itemStyle.transition).toBe('transform 0.2s ease-out');
  });
});

describe('useSwipeAction — background indicators', () => {
  it('shows left background when swiped left beyond 20px', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft, leftLabel: 'Delete' }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    // Swipe left by 50px: offset = -50 * 0.6 = -30 > 20
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(150, 100));
    });

    expect(result.current.leftBg).not.toBeNull();
    expect(result.current.leftBg!.label).toBe('Delete');
  });

  it('shows right background when swiped right beyond 20px', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeRight, rightLabel: 'Done' }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(100, 100));
    });

    // Swipe right by 50px: offset = 50 * 0.6 = 30 > 20
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(150, 100));
    });

    expect(result.current.rightBg).not.toBeNull();
    expect(result.current.rightBg!.label).toBe('Done');
  });

  it('no background shown for small swipe', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipeAction({ onSwipeLeft }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent(200, 100));
    });

    // Very small swipe: 10px * 0.6 = 6 < 20
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent(190, 100));
    });

    expect(result.current.leftBg).toBeNull();
  });
});
