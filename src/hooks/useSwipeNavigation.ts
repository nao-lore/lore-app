import { useEffect, useRef } from 'react';

/**
 * Mobile swipe-back gesture hook.
 * Listens for right-swipe from the left edge on mobile (<768px)
 * and triggers the provided callback when the swipe exceeds 100px.
 */
export function useSwipeNavigation(onBack: () => void) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const swiping = useRef(false);

  useEffect(() => {
    // Only active on mobile-width screens
    if (window.innerWidth >= 768) return;

    // Create the visual indicator element
    const indicator = document.createElement('div');
    indicator.className = 'swipe-indicator';
    document.body.appendChild(indicator);
    indicatorRef.current = indicator;

    const EDGE_ZONE = 30; // px from left edge to start detecting
    const SWIPE_THRESHOLD = 100; // px required to trigger back

    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return;
      const touch = e.touches[0];
      if (touch.clientX <= EDGE_ZONE) {
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
        swiping.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!swiping.current || touchStartX.current === null || touchStartY.current === null) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX.current;
      const dy = Math.abs(touch.clientY - touchStartY.current);

      // If vertical movement dominates, cancel swipe detection
      if (dy > dx) {
        swiping.current = false;
        if (indicatorRef.current) indicatorRef.current.classList.remove('active');
        return;
      }

      if (dx > 20) {
        if (indicatorRef.current) indicatorRef.current.classList.add('active');
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!swiping.current || touchStartX.current === null) {
        swiping.current = false;
        return;
      }
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX.current;

      if (dx >= SWIPE_THRESHOLD) {
        onBack();
      }

      // Reset
      touchStartX.current = null;
      touchStartY.current = null;
      swiping.current = false;
      if (indicatorRef.current) indicatorRef.current.classList.remove('active');
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
      indicatorRef.current = null;
    };
  }, [onBack]);
}
