import { useState, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '../storage';

const SIDEBAR_KEY = 'threadlog_sidebar';

export function useSidebarState() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = safeGetItem(SIDEBAR_KEY);
    return saved !== 'hidden' && saved !== 'collapsed';
  });
  const [sidebarHidden, setSidebarHidden] = useState(() => safeGetItem(SIDEBAR_KEY) === 'hidden');

  const handleCollapseSidebar = useCallback(() => {
    setSidebarOpen(false);
    safeSetItem(SIDEBAR_KEY, 'collapsed');
  }, []);

  const handleHideSidebar = useCallback(() => {
    setSidebarOpen(false);
    setSidebarHidden(true);
    safeSetItem(SIDEBAR_KEY, 'hidden');
  }, []);

  return {
    sidebarOpen, setSidebarOpen,
    sidebarHidden, setSidebarHidden,
    handleCollapseSidebar, handleHideSidebar,
    SIDEBAR_KEY,
  };
}
