import { useEffect, useRef } from 'react';
import { purgeExpiredTrash, getAutoReportSetting, getLastReportDate, recordActivity, safeGetItem, safeSetItem, loadTodos } from '../storage';
import { isOnboardingDone } from '../onboardingState';
import { registerSW } from 'virtual:pwa-register';
import { t, tf } from '../i18n';
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
  setOfflineStatus: (v: 'online' | 'offline' | 'back-online') => void;
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
      paramsRef.current.setOfflineStatus('back-online');
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

  // 7. Chrome extension import + deep link (mount-only, attaches hashchange listener)
  useEffect(() => {
    const handleExtensionHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#import=')) {
        paramsRef.current.setSelectedId(null);
        paramsRef.current.setInputKey((k: number) => k + 1);
        (paramsRef.current.inputDirtyRef as React.MutableRefObject<boolean>).current = false;
        paramsRef.current.setView('input');
        paramsRef.current.showToast(t('extensionReceived', paramsRef.current.lang), 'success');
      } else if (hash.startsWith('#log=')) {
        const logId = hash.slice(5);
        window.location.hash = '';
        if (logId) {
          const tryNavigate = () => {
            paramsRef.current.refreshLogs();
            paramsRef.current.setSelectedId(logId);
            paramsRef.current.setView('detail');
          };
          // Try immediately — if log exists in localStorage, navigate right away
          const raw = localStorage.getItem('threadlog_logs');
          const existing = raw ? JSON.parse(raw) as { id: string }[] : [];
          if (existing.some((l) => l.id === logId)) {
            tryNavigate();
          } else {
            // Log not yet imported from extension — wait for bridge sync
            const onLogsImported = () => {
              window.removeEventListener('lore-logs-updated', onLogsImported);
              tryNavigate();
            };
            window.addEventListener('lore-logs-updated', onLogsImported);
            // Timeout fallback: if bridge doesn't fire in 3s, try anyway
            setTimeout(() => {
              window.removeEventListener('lore-logs-updated', onLogsImported);
              tryNavigate();
            }, 3000);
          }
        }
      }
    };
    handleExtensionHash();
    window.addEventListener('hashchange', handleExtensionHash);
    return () => window.removeEventListener('hashchange', handleExtensionHash);
  }, []);

  // 8. Listen for extension bridge log imports (mount-only)
  useEffect(() => {
    const handleLogsUpdated = () => {
      paramsRef.current.refreshLogs();
      paramsRef.current.showToast(t('extensionReceived', paramsRef.current.lang), 'success');
    };
    window.addEventListener('lore-logs-updated', handleLogsUpdated);
    return () => window.removeEventListener('lore-logs-updated', handleLogsUpdated);
  }, []);

  // 9. Show onboarding if not yet completed (mount-only)
  useEffect(() => {
    if (!isOnboardingDone()) {
      paramsRef.current.setShowOnboarding(true);
    }
  }, []);

  // 9. In-app reminder if no snapshot in 3+ days (mount-only)
  useEffect(() => {
    ric(() => {
      const { logs, lang, showToast } = paramsRef.current;
      if (logs.length === 0) return;

      // Check if last snapshot was 3+ days ago
      const handoffs = logs.filter((l) => l.outputMode === 'handoff');
      if (handoffs.length === 0) return;
      const latestTs = Math.max(...handoffs.map((l) => new Date(l.createdAt).getTime()));
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (Date.now() - latestTs < threeDays) return;

      // Check last reminder date to avoid spamming (max once per day)
      const REMINDER_KEY = 'threadlog_last_reminder_date';
      const lastReminder = safeGetItem(REMINDER_KEY);
      if (lastReminder) {
        const lastDate = new Date(lastReminder).toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        if (lastDate === today) return;
      }

      safeSetItem(REMINDER_KEY, new Date().toISOString());
      showToast(t('reminderNoSnapshots', lang), 'default');
    });
  }, []);

  // 10. Warn user before closing tab with unsaved input (mount-only)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if ((paramsRef.current.inputDirtyRef as React.MutableRefObject<boolean>).current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // 11. Overdue TODO toast on app load (once per day max)
  useEffect(() => {
    ric(() => {
      const { lang, showToast } = paramsRef.current;
      const today = new Date().toISOString().slice(0, 10);
      const OVERDUE_TOAST_KEY = 'threadlog_overdue_toast_date';
      const lastToast = safeGetItem(OVERDUE_TOAST_KEY);
      if (lastToast === today) return;

      const todos = loadTodos();
      const overdueCount = todos.filter((td) => !td.done && td.dueDate && td.dueDate < today).length;
      if (overdueCount > 0) {
        safeSetItem(OVERDUE_TOAST_KEY, today);
        showToast(tf('toastOverdueTodos', lang, overdueCount), 'default');
      }
    });
  }, []);

  // 12. Multi-tab localStorage sync (uses stable refreshLogs)
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
