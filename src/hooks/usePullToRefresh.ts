import { useState, useRef, useCallback } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number; // px to trigger refresh, default 80
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: PullToRefreshOptions) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const scrollEl = useRef<HTMLElement | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget as HTMLElement;
    scrollEl.current = el;
    if (el.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const el = scrollEl.current;
    if (el && el.scrollTop > 0) {
      setPulling(false);
      setPullDistance(0);
      return;
    }
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
    }
  }, [pulling, refreshing, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPulling(false);
    setPullDistance(0);
  }, [pullDistance, threshold, refreshing, onRefresh]);

  return {
    pullDistance,
    refreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    indicatorStyle: pullDistance > 0 ? {
      height: pullDistance,
      display: 'flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      fontSize: 12,
      color: 'var(--text-muted)',
      transition: pulling ? 'none' : 'height 0.2s',
    } : undefined,
  };
}
