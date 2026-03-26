import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Menu, ChevronUp, ArrowLeft, Download, X } from 'lucide-react';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import BottomNav from './BottomNav';
import { ToastStack } from './Toast';
import Onboarding from './Onboarding';
import SkeletonLoader from './SkeletonLoader';
import FeedbackModal from './FeedbackModal';
import { isDemoMode, setDemoMode, safeGetItem, safeSetItem, safeRemoveItem } from './storage';
import type { ThemePref } from './storage';
import type { FontSize } from './types';
import { t } from './i18n';
import { useAppState } from './hooks/useAppState';
import { useBootstrapEffects } from './hooks/useBootstrapEffects';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useScrollPosition } from './hooks/useScrollPosition';
import { useThemeSync } from './hooks/useThemeSync';
import type { View } from './hooks/useAppState';
import { isOnboardingDone } from './onboardingState';
import { setProFromCheckout } from './utils/proManager';

// Extracted components
import { DemoBanner, OverdueBanner, ReportReminderBanner, OfflineBanner } from './components/AppBanners';
import { ShortcutsModal, UnsavedInputDialog } from './components/AppModals';
import { useViewRouteMap } from './components/AppRoutes';

const LandingPage = lazy(() => import('./LandingPage'));

export type { View };

const VIEW_DEPTH: Record<View, number> = {
  input: 0, dashboard: 0, history: 0, todos: 0, timeline: 0, projects: 0,
  settings: 1, help: 1, pricing: 1, trash: 1, weeklyreport: 1, summarylist: 1,
  projecthome: 2, masternote: 3, knowledgebase: 3, detail: 3,
};

const isStandalone = typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
   (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

const FONT_SIZE_SCALE: Record<FontSize, number> = { small: 0.87, medium: 1, large: 1.13 };

export default function App() {
  const { inputDirtyRef, scrollRef, scrollPositionRef, shortcutsTrapRef, ...s } = useAppState();
  const [showLanding, setShowLanding] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('home')) return true;
    if (params.has('ref') && params.get('ref') === 'lp') { s.setShowOnboarding(true); const url = new URL(window.location.href); url.searchParams.delete('ref'); window.history.replaceState({}, '', url.pathname + url.search); return false; }
    if (s.logs.length === 0 && !isOnboardingDone()) { s.setShowOnboarding(true); return false; }
    return false;
  });
  const [navState, setNavState] = useState<{ direction: 'forward' | 'back'; prevView: View }>({ direction: 'forward', prevView: s.view });
  if (navState.prevView !== s.view) {
    const prevDepth = VIEW_DEPTH[navState.prevView] ?? 0;
    const nextDepth = VIEW_DEPTH[s.view] ?? 0;
    setNavState({ direction: nextDepth >= prevDepth ? 'forward' : 'back', prevView: s.view });
  }

  useBootstrapEffects({ lang: s.lang, showToast: s.showToast, setShowReportReminder: s.setShowReportReminder, setSelectedId: s.setSelectedId, setInputKey: s.setInputKey, inputDirtyRef, setView: s.setView, setShowOnboarding: s.setShowOnboarding, setOfflineStatus: s.setOfflineStatus, setOfflineDismissed: s.setOfflineDismissed, setShowScrollTop: s.setShowScrollTop, scrollRef, refreshLogs: s.refreshLogs, logs: s.logs });
  useSwipeNavigation(s.handleBack);

  const checkoutHandledRef = React.useRef(false);
  useEffect(() => {
    if (checkoutHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    checkoutHandledRef.current = true;
    if (checkout === 'success') { setProFromCheckout(params.get('session_id') || `checkout_${Date.now()}`); s.showToast(t('checkoutSuccess', s.lang), 'success'); }
    else if (checkout === 'cancelled') s.showToast(t('checkoutCancelled', s.lang), 'default');
    const url = new URL(window.location.href); url.searchParams.delete('checkout'); url.searchParams.delete('session_id'); window.history.replaceState({}, '', url.pathname);
  }, [s, s.lang]);

  const [demoMode, setDemoModeState] = useState(() => isDemoMode());

  // P8: Capture beforeinstallprompt to prevent duplicate install banners
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(() => { try { return sessionStorage.getItem('pwa-install-dismissed') === '1'; } catch { return false; } });
  useEffect(() => {
    if (isStandalone) return; // already installed
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setDeferredInstallPrompt(null);
    }
  }, [deferredInstallPrompt]);

  const viewLabelMap: Partial<Record<View, string>> = {
    input: t('tabTitleInput', s.lang), detail: t('tabTitleDetail', s.lang), dashboard: t('tabTitleDashboard', s.lang),
    history: t('tabTitleHistory', s.lang), todos: t('tabTitleTodos', s.lang), timeline: t('tabTitleTimeline', s.lang),
    projects: t('tabTitleProjects', s.lang), settings: t('tabTitleSettings', s.lang), help: t('tabTitleHelp', s.lang),
    pricing: t('tabTitlePricing', s.lang), masternote: t('tabTitleMasternote', s.lang), projecthome: t('tabTitleProjecthome', s.lang),
    weeklyreport: t('tabTitleWeeklyreport', s.lang), trash: t('tabTitleTrash', s.lang), summarylist: t('tabTitleSummarylist', s.lang),
    knowledgebase: t('tabTitleKnowledgebase', s.lang),
  };

  useEffect(() => {
    const viewTitleMap: Partial<Record<View, string>> = { dashboard: `${t('tabTitleDashboard', s.lang)} — Lore`, todos: `${t('tabTitleTodos', s.lang)} — Lore`, history: `${t('tabTitleHistory', s.lang)} — Lore`, timeline: `${t('tabTitleTimeline', s.lang)} — Lore`, projects: `${t('tabTitleProjects', s.lang)} — Lore`, settings: `${t('tabTitleSettings', s.lang)} — Lore`, help: `${t('tabTitleHelp', s.lang)} — Lore`, pricing: `${t('tabTitlePricing', s.lang)} — Lore` };
    if (s.view === 'detail') return;
    const base = viewTitleMap[s.view] || 'Lore';
    document.title = s.pendingCount > 0 ? `(${s.pendingCount}) ${base}` : base;
  }, [s.pendingCount, s.view, s.lang]);

  useEffect(() => { const root = document.getElementById('root'); if (!root) return; const scale = FONT_SIZE_SCALE[s.fontSize]; if (scale === 1) { root.style.transform = ''; root.style.transformOrigin = ''; root.style.width = ''; root.style.height = '100vh'; } else { root.style.transform = `scale(${scale})`; root.style.webkitTransform = `scale(${scale})`; root.style.transformOrigin = 'top left'; root.style.webkitTransformOrigin = 'top left'; root.style.width = `${100 / scale}%`; root.style.height = `${100 / scale}vh`; } }, [s.fontSize]);
  useEffect(() => { safeSetItem(s.LAST_VIEW_KEY, s.view); }, [s.view, s.LAST_VIEW_KEY]);
  useEffect(() => { if (s.activeProjectId) safeSetItem(s.LAST_PROJECT_KEY, s.activeProjectId); else safeRemoveItem(s.LAST_PROJECT_KEY); }, [s.activeProjectId, s.LAST_PROJECT_KEY]);
  useEffect(() => { const handler = () => s.showToast(t('storageFullWarning', s.lang), 'error'); window.addEventListener('lore-storage-full', handler); const ph = () => s.goTo('pricing'); window.addEventListener('lore-navigate-pricing', ph); return () => { window.removeEventListener('lore-storage-full', handler); window.removeEventListener('lore-navigate-pricing', ph); }; }, [s]);

  useThemeSync(s.themePref, s.lang);
  useKeyboardShortcuts({ setPaletteOpen: s.setPaletteOpen, handleNewLog: s.handleNewLog, goToRaw: s.goToRaw, goTo: s.goTo, setShortcutsOpen: s.setShortcutsOpen, shortcutsOpen: s.shortcutsOpen, paletteOpen: s.paletteOpen, view: s.view, prevView: s.prevView, activeProjectId: s.activeProjectId, setActiveProjectId: s.setActiveProjectId });
  useScrollPosition(s.view, s.selectedId, scrollRef, scrollPositionRef);

  const { renderWorkspace } = useViewRouteMap(s);

  if (showLanding) return <Suspense fallback={<SkeletonLoader lang={s.lang} variant="card" />}><LandingPage lang={s.lang} onGetStarted={() => { setShowLanding(false); s.setShowOnboarding(true); }} /></Suspense>;

  return (
    <div className="app-root">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div aria-live="polite" role="status" className="sr-only">{viewLabelMap[s.view] || s.view}</div>
      {!s.sidebarOpen && !s.sidebarHidden && <div className="sidebar-collapsed-strip"><button className="toggle-btn" onClick={() => { s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); }} title={t('showSidebar', s.lang)} aria-label={t('ariaShowSidebar', s.lang)}><Menu size={18} /></button></div>}
      {!s.sidebarOpen && s.sidebarHidden && <button className="mobile-menu-btn" onClick={() => { s.setSidebarHidden(false); s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); }} title={t('showSidebar', s.lang)} aria-label={t('ariaShowSidebar', s.lang)}><Menu size={20} /></button>}
      {s.sidebarHidden && <button className="sidebar-reveal-bar" onClick={() => { s.setSidebarHidden(false); s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); }} title={t('showSidebar', s.lang)} aria-label={t('ariaShowSidebar', s.lang)} />}
      {s.sidebarOpen && <aside aria-label="Sidebar"><Sidebar logs={s.logs} projects={s.projects} todos={s.todos} selectedId={s.selectedId} activeProjectId={s.activeProjectId} activeView={s.view} onSelect={s.handleSelect} onNewLog={s.handleNewLog} onOpenSettings={s.handleGoToSettings} onOpenHistory={s.handleGoToHistory} onOpenProjects={s.handleGoToProjects} onOpenTodos={s.handleGoToTodos} onOpenProjectSummaryList={s.handleGoToSummaryList} onOpenDashboard={s.handleGoToDashboard} onOpenTimeline={s.handleGoToTimeline} onOpenWeeklyReport={s.handleGoToWeeklyReport} onOpenTrash={s.handleGoToTrash} onOpenHelp={s.handleGoToHelp} onOpenPricing={s.handleGoToPricing} onCollapse={s.handleCollapseSidebar} onHide={s.handleHideSidebar} onSelectProject={s.handleOpenProjectLogs} onOpenMasterNote={s.handleOpenMasterNote} onRefresh={s.refreshLogs} onDeleted={s.handleDeleted} lang={s.lang} showToast={s.showToast} masterNotes={s.masterNotes} /></aside>}
      {isStandalone && (VIEW_DEPTH[s.view] ?? 0) >= 1 && (
        <button className="pwa-standalone-back" onClick={() => window.history.back()} aria-label={t('ariaGoBack', s.lang)}>
          <ArrowLeft size={18} />
          <span>{t('pwaBackButton', s.lang)}</span>
        </button>
      )}
      {!isStandalone && deferredInstallPrompt && !installDismissed && (
        <div className="pwa-install-wrapper">
          <button className="pwa-install-btn" onClick={handleInstallClick} aria-label={t('pwaInstallApp', s.lang)}>
            <Download size={16} />
            <span>{t('pwaInstallApp', s.lang)}</span>
          </button>
          <button className="pwa-install-dismiss" onClick={() => { setInstallDismissed(true); try { sessionStorage.setItem('pwa-install-dismissed', '1'); } catch { /* dismiss */ } }} aria-label="Dismiss install prompt">
            <X size={12} />
          </button>
        </div>
      )}
      <main id="main-content" tabIndex={-1} ref={scrollRef} data-main-scroll className="main-content">
        {demoMode && <DemoBanner lang={s.lang} onExitDemo={() => { setDemoMode(false); setDemoModeState(false); s.setLogsVersion((v: number) => v + 1); }} />}
        <div className="h-full">
          <Suspense fallback={<SkeletonLoader lang={s.lang} variant={s.view === 'dashboard' ? 'card' : s.view === 'detail' ? 'detail' : 'list'} />}>
            <div className={navState.direction === 'back' ? 'view-slide-back' : 'view-slide-forward'} key={s.view}>{renderWorkspace()}</div>
          </Suspense>
        </div>
      </main>
      <button className={`scroll-to-top${s.showScrollTop ? ' visible' : ''}`} onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} aria-label={t('ariaScrollToTop', s.lang)}><ChevronUp size={18} /></button>
      {s.showOverdueBanner && <OverdueBanner lang={s.lang} overdueTodos={s.overdueTodos} todayKey={s.todayKey} onGoToTodos={() => s.goTo('todos')} onDismiss={() => s.setBannerDismissed(true)} />}
      {s.showReportReminder && <ReportReminderBanner lang={s.lang} onDismiss={() => s.setShowReportReminder(false)} onGenerate={() => s.goToRaw('weeklyreport')} />}
      <BottomNav activeView={s.view} onNavigate={s.handleBottomNav} lang={s.lang} />
      {s.offlineStatus !== 'online' && !s.offlineDismissed && <OfflineBanner lang={s.lang} offlineStatus={s.offlineStatus} onDismiss={() => s.setOfflineDismissed(true)} />}
      <ToastStack toasts={s.toasts} />
      {s.paletteOpen && <CommandPalette logs={s.logs} projects={s.projects} masterNotes={s.masterNotes} onSelectLog={s.handleSelect} onSelectProject={s.handlePaletteSelectProject} onSelectSummary={s.handleOpenMasterNote} onClose={() => s.setPaletteOpen(false)} lang={s.lang} onNavigate={(view: View) => { s.setPaletteOpen(false); s.goTo(view); }} onToggleTheme={(theme: ThemePref) => { s.handleThemeChange(theme); }} onNewProject={() => { s.setPaletteOpen(false); s.goTo('projects'); }} />}
      {s.showOnboarding && <Onboarding lang={s.lang} onLangChange={s.handleUiLangChange} onClose={s.handleOnboardingClose} initialStep={parseInt(safeGetItem('threadlog_onboarding_step') || '0', 10)} />}
      {s.helpFeedbackOpen && <FeedbackModal lang={s.lang} onClose={() => s.setHelpFeedbackOpen(false)} />}
      {s.pendingNav && <UnsavedInputDialog lang={s.lang} onConfirm={() => { const nav = s.pendingNav; s.setPendingNav(null); s.clearInputDirty(); nav!(); }} onCancel={() => s.setPendingNav(null)} />}
      {s.shortcutsOpen && <ShortcutsModal lang={s.lang} shortcutsTrapRef={shortcutsTrapRef} onClose={() => s.setShortcutsOpen(false)} />}
    </div>
  );
}
