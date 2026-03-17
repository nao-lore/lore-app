import { useEffect, useRef } from 'react';
import { purgeExpiredTrash, getAutoReportSetting, getLastReportDate, recordActivity } from '../storage';
import { isOnboardingDone } from '../onboardingState';
import { registerSW } from 'virtual:pwa-register';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { LogEntry } from '../types';
import type { View } from './useAppState';

interface BootstrapParams {
  lang: Lang;
  showToast: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  setShowReportReminder: (v: boolean) => void;
  setSelectedId: (v: string | null) => void;
  setInputKey: (fn: (k: number) => number) => void;
  inputDirtyRef: React.RefObject<boolean>;
  setView: (v: View) => void;
  setShowOnboarding: (v: boolean) => void;
  setOfflineStatus: (v: 'online' | 'offline' | 'back') => void;
  setOfflineDismissed: (v: boolean) => void;
  setShowScrollTop: (v: boolean) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
  refreshLogs: () => void;
  logs: LogEntry[];
}

// Fallback for browsers without requestIdleCallback (e.g. Safari < 16.4)
const ric = typeof window !== 'undefined' && window.requestIdleCallback
  ? window.requestIdleCallback
  : (cb: () => void) => setTimeout(cb, 1);

/**
 * Consolidates all mount-only / bootstrap effects from App.tsx.
 * Each effect runs once on mount (or with minimal stable deps).
 */
export function useBootstrapEffects(params: BootstrapParams): void {
  // Capture params in refs so mount-only effects always read latest values
  // without needing them as deps.
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });

  // 1. Offline / online detection (mount-only, attaches listeners)
  useEffect(() => {
    let onlineTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOffline = () => {
      paramsRef.current.setOfflineStatus('offline');
      paramsRef.current.setOfflineDismissed(false);
    };
    const handleOnline = () => {
      paramsRef.current.setOfflineStatus('back');
      onlineTimer = setTimeout(() => paramsRef.current.setOfflineStatus('online'), 3000);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (onlineTimer) clearTimeout(onlineTimer);
    };
  }, []);

  // 2. Scroll-to-top button visibility (mount-only, attaches scroll listener)
  useEffect(() => {
    const el = paramsRef.current.scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      paramsRef.current.setShowScrollTop(el.scrollTop > 400);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // 3. PWA service worker update notification (mount-only)
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        paramsRef.current.showToast(
          t('updateAvailable', paramsRef.current.lang),
          'default',
          {
            label: t('updateReload', paramsRef.current.lang),
            onClick: () => { updateSW(); },
          },
        );
      },
    });
  }, []);

  // 4. Purge expired trash on app load (mount-only, non-urgent)
  useEffect(() => { ric(() => { purgeExpiredTrash(); }); }, []);

  // 5. Record daily activity for streak tracking (mount-only, non-urgent)
  useEffect(() => { ric(() => { recordActivity(); }); }, []);

  // 6. Auto weekly report reminder on app load (mount-only)
  useEffect(() => {
    if (!getAutoReportSetting()) return;
    const last = getLastReportDate();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (last === null || Date.now() - last >= sevenDays) {
      paramsRef.current.setShowReportReminder(true);
    }
  }, []);

  // 7. Chrome extension import (mount-only, attaches hashchange listener)
  useEffect(() => {
    const handleExtensionImport = () => {
      if (window.location.hash.startsWith('#import=')) {
        paramsRef.current.setSelectedId(null);
        paramsRef.current.setInputKey((k: number) => k + 1);
        (paramsRef.current.inputDirtyRef as React.MutableRefObject<boolean>).current = false;
        paramsRef.current.setView('input');
        paramsRef.current.showToast(t('extensionReceived', paramsRef.current.lang), 'success');
      }
    };
    handleExtensionImport();
    window.addEventListener('hashchange', handleExtensionImport);
    return () => window.removeEventListener('hashchange', handleExtensionImport);
  }, []);

  // 8. Show onboarding on first launch (mount-only)
  useEffect(() => {
    if (paramsRef.current.logs.length === 0 && !isOnboardingDone()) {
      paramsRef.current.setShowOnboarding(true);
    }
  }, []);

  // 9. Warn user before closing tab with unsaved input (mount-only)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if ((paramsRef.current.inputDirtyRef as React.MutableRefObject<boolean>).current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // 10. Multi-tab localStorage sync (uses stable refreshLogs)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'threadlog_logs' ||
        e.key === 'threadlog_projects' ||
        e.key === 'threadlog_todos' ||
        e.key === 'threadlog_master_notes'
      ) {
        paramsRef.current.refreshLogs();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
