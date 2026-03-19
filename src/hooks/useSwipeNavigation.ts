import { useEffect, useRef } from 'react';

/**
 * Mobile swipe-back gesture hook.
 * Listens for right-swipe from the left edge on mobile (<768px)
 * and triggers the provided callback when the swipe exceeds 100px.
 * Shows progressive opacity feedback and a chevron indicator.
 */
export function useSwipeNavigation(onBack: () => void) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const chevronRef = useRef<HTMLDivElement | null>(null);
  const swiping = useRef(false);

  useEffect(() => {
    // Only active on mobile-width screens
    if (window.innerWidth >= 768) return;

    // Create the visual indicator element
    const indicator = document.createElement('div');
    indicator.className = 'swipe-indicator';
    document.body.appendChild(indicator);
    indicatorRef.current = indicator;

    // Create the chevron element inside the indicator
    const chevron = document.createElement('div');
    chevron.className = 'swipe-chevron';
    chevron.textContent = '\u2039'; // single left-pointing angle quotation mark
    indicator.appendChild(chevron);
    chevronRef.current = chevron;

    const EDGE_ZONE = 30; // px from left edge to start detecting
    const SWIPE_THRESHOLD = 100; // px required to trigger back

    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return;
      const touch = e.touches[0];
      if (touch.clientX <= EDGE_ZONE) {
        // Skip swipe detection inside scrollable containers (e.g. PostGenerationPreview)
        const target = e.target as HTMLElement | null;
        if (target?.closest('.input-preview-result, .input-preview, [data-no-swipe], .ql-editor, .ProseMirror, [data-radix-scroll-area], .virtual-list')) return;
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
        if (indicatorRef.current) {
          indicatorRef.current.classList.remove('active');
          indicatorRef.current.style.opacity = '0';
        }
        if (chevronRef.current) {
          chevronRef.current.style.opacity = '0';
          chevronRef.current.style.transform = 'translateX(-8px)';
        }
        return;
      }

      if (dx > 10) {
        // Progressive opacity: 0 at 10px, 1 at SWIPE_THRESHOLD
        const progress = Math.min((dx - 10) / (SWIPE_THRESHOLD - 10), 1);
        if (indicatorRef.current) {
          indicatorRef.current.classList.add('active');
          indicatorRef.current.style.opacity = String(progress);
          indicatorRef.current.style.width = `${Math.max(12, Math.min(dx * 0.3, 40))}px`;
        }
        if (chevronRef.current) {
          chevronRef.current.style.opacity = String(Math.min(progress * 1.5, 1));
          chevronRef.current.style.transform = `translateX(${Math.min(dx * 0.15, 12)}px)`;
        }
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
      if (indicatorRef.current) {
        indicatorRef.current.classList.remove('active');
        indicatorRef.current.style.opacity = '0';
        indicatorRef.current.style.width = '12px';
      }
      if (chevronRef.current) {
        chevronRef.current.style.opacity = '0';
        chevronRef.current.style.transform = 'translateX(-8px)';
      }
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
      chevronRef.current = null;
    };
  }, [onBack]);
}
