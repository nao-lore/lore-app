import { useEffect } from 'react';
import type { View } from './useNavigation';

/**
 * Restore scroll position when view changes.
 * Only depends on view (not selectedId) to avoid iOS Safari viewport reset
 * when handleSaved sets selectedId while PostGenerationPreview is shown.
 */
export function useScrollPosition(
  view: View,
  selectedId: string | null,
  scrollRef: React.RefObject<HTMLElement | null>,
  scrollPositionRef: React.MutableRefObject<Record<string, number>>,
): void {
  const selectedIdForScroll = view === 'detail' ? selectedId : null;

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const positions = scrollPositionRef.current;
    requestAnimationFrame(() => {
      if (scrollEl) {
        const scrollKey = selectedIdForScroll ? `detail:${selectedIdForScroll}` : view;
        const saved = positions[scrollKey];
        scrollEl.scrollTo(0, saved || 0);
      }
    });
  }, [view, selectedIdForScroll, scrollRef, scrollPositionRef]);
}
