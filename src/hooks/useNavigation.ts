import { useState, useCallback, useRef, useEffect, startTransition } from 'react';
import { safeGetItem, loadLogs } from '../storage';

export type View = 'input' | 'detail' | 'settings' | 'history' | 'masternote' | 'projects' | 'todos' | 'trash' | 'summarylist' | 'projecthome' | 'timeline' | 'help' | 'weeklyreport' | 'knowledgebase' | 'dashboard' | 'pricing';

const LAST_VIEW_KEY = 'threadlog_last_view';

/** Navigation state management with history stack and deep-linking */
export function useNavigation() {
  const [view, setView] = useState<View>(() => {
    const saved = safeGetItem(LAST_VIEW_KEY);
    if (saved && saved !== 'detail' && saved !== 'masternote' && saved !== 'projecthome' && saved !== 'knowledgebase') return saved as View;
    // New users with no logs land on input, not dashboard
    const hasLogs = loadLogs().length > 0;
    return hasLogs ? 'dashboard' : 'input';
  });
  const [prevView, setPrevView] = useState<View>('input');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const scrollRef = useRef<HTMLElement>(null);
  const scrollPositionRef = useRef<Record<string, number>>({});
  const inputDirtyRef = useRef(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  // Stable ref holders so callbacks always see the latest version
  const goToRawRef = useRef<(next: View) => void>(null!);
  const goToRef = useRef<(next: View) => void>(null!);

  // Navigation core
  const goToRaw = useCallback((next: View) => {
    if (scrollRef.current) {
      const scrollKey = view === 'detail' && selectedId ? `detail:${selectedId}` : view;
      scrollPositionRef.current[scrollKey] = scrollRef.current.scrollTop;
    }
    startTransition(() => {
      setPrevView(view);
      setView(next);
    });
    requestAnimationFrame(() => scrollRef.current?.focus());
  }, [view, selectedId]);

  // Navigation with dirty-input guard
  const goTo = useCallback((next: View) => {
    if (view === 'input' && inputDirtyRef.current && next !== 'input') {
      setPendingNav(() => () => goToRaw(next));
      return;
    }
    goToRaw(next);
  }, [view, goToRaw]);

  // Keep refs in sync
  useEffect(() => {
    goToRawRef.current = goToRaw;
    goToRef.current = goTo;
  });

  const handleSelect = useCallback((id: string) => {
    const doNav = () => { setSelectedId(id); goToRawRef.current('detail'); };
    if (view === 'input' && inputDirtyRef.current) {
      setPendingNav(() => doNav);
      return;
    }
    doNav();
  }, [view]);

  const handleNewLog = useCallback(() => {
    setSelectedId(null);
    setInputKey((k) => k + 1);
    inputDirtyRef.current = false;
    goToRawRef.current('input');
  }, []);

  const handleBack = useCallback((activeProjectId: string | null) => {
    goToRef.current(prevView === 'detail' ? (activeProjectId ? 'projecthome' : 'history') : prevView);
  }, [prevView]);

  const navDirection = undefined; // reserved for future animation direction

  const clearInputDirty = useCallback(() => { inputDirtyRef.current = false; }, []);
  const setInputDirty = useCallback((dirty: boolean) => { inputDirtyRef.current = dirty; }, []);
  const goHome = useCallback(() => {
    setSelectedId(null);
    setInputKey((k) => k + 1);
    inputDirtyRef.current = false;
    goToRawRef.current('input');
  }, []);

  return {
    view, setView, prevView, setPrevView,
    selectedId, setSelectedId,
    inputKey, setInputKey,
    scrollRef, scrollPositionRef,
    inputDirtyRef,
    pendingNav, setPendingNav,
    goToRaw, goTo,
    goToRawRef, goToRef,
    handleSelect, handleNewLog, handleBack,
    navDirection,
    clearInputDirty, setInputDirty, goHome,
    LAST_VIEW_KEY,
  };
}
