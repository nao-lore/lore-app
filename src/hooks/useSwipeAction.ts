import { useState, useRef, useCallback } from 'react';

interface SwipeActionOptions {
  onSwipeLeft?: () => void;  // e.g., delete/trash
  onSwipeRight?: () => void; // e.g., archive/done
  threshold?: number;        // px to trigger action (default: 100)
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
}

/** Touch swipe gesture handler for mobile list items */
export function useSwipeAction(opts: SwipeActionOptions) {
  const {
    onSwipeLeft, onSwipeRight,
    threshold = 100,
    leftLabel = '', rightLabel = '',
    leftColor = 'var(--error-bg)', rightColor = 'var(--success-bg)',
  } = opts;

  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(false); // lock direction after first move

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = false;
    setSwiping(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Lock to horizontal after 10px movement
    if (!locked.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      locked.current = true;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical scroll — cancel swipe
        setSwiping(false);
        setOffset(0);
        return;
      }
    }

    if (!locked.current) return;

    // Only allow swipe in directions that have handlers
    if (dx < 0 && !onSwipeLeft) return;
    if (dx > 0 && !onSwipeRight) return;

    setOffset(dx * 0.6); // damping
  }, [swiping, onSwipeLeft, onSwipeRight]);

  const onTouchEnd = useCallback(() => {
    if (offset < -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (offset > threshold && onSwipeRight) {
      onSwipeRight();
    }
    setOffset(0);
    setSwiping(false);
  }, [offset, threshold, onSwipeLeft, onSwipeRight]);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
  };

  const itemStyle: React.CSSProperties = swiping ? {
    transform: `translateX(${offset}px)`,
    transition: 'none',
  } : {
    transform: 'translateX(0)',
    transition: 'transform 0.2s ease-out',
  };

  // Background indicators
  const leftBg = offset < -20 ? {
    position: 'absolute' as const, right: 0, top: 0, bottom: 0,
    width: Math.abs(offset),
    background: leftColor,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', fontSize: 12, fontWeight: 600,
    opacity: Math.min(Math.abs(offset) / threshold, 1),
  } : undefined;

  const rightBg = offset > 20 ? {
    position: 'absolute' as const, left: 0, top: 0, bottom: 0,
    width: offset,
    background: rightColor,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', fontSize: 12, fontWeight: 600,
    opacity: Math.min(offset / threshold, 1),
  } : undefined;

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    containerStyle,
    itemStyle,
    leftBg: leftBg ? { style: leftBg, label: leftLabel } : null,
    rightBg: rightBg ? { style: rightBg, label: rightLabel } : null,
  };
}
