import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Menu, ChevronUp } from 'lucide-react';
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import CommandPalette from './CommandPalette';
import BottomNav from './BottomNav';
import { Toast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import Onboarding from './Onboarding';
import ErrorBoundary from './ErrorBoundary';
import SkeletonLoader from './SkeletonLoader';
import FeedbackModal from './FeedbackModal';
import { setLastReportDate, isDemoMode, setDemoMode, getFeatureEnabled, safeGetItem, safeSetItem, safeRemoveItem } from './storage';
import type { ThemePref } from './storage';
import type { FontSize } from './types';
import { t, tf } from './i18n';
import { useAppState } from './hooks/useAppState';
import { useBootstrapEffects } from './hooks/useBootstrapEffects';
import type { View } from './hooks/useAppState';

export type { View };

const HistoryView = lazy(() => import('./HistoryView'));
const SettingsPanel = lazy(() => import('./SettingsPanel'));
const MasterNoteView = lazy(() => import('./MasterNoteView'));
const ProjectsView = lazy(() => import('./ProjectsView'));
const TodoView = lazy(() => import('./TodoView'));
const TrashView = lazy(() => import('./TrashView'));
const ProjectSummaryListView = lazy(() => import('./ProjectSummaryListView'));
const ProjectHomeView = lazy(() => import('./ProjectHomeView'));
const TimelineView = lazy(() => import('./TimelineView'));
const DashboardView = lazy(() => import('./DashboardView'));
const HelpView = lazy(() => import('./HelpView'));
const WeeklyReportView = lazy(() => import('./WeeklyReportView'));
const KnowledgeBaseView = lazy(() => import('./KnowledgeBaseView'));
const PricingView = lazy(() => import('./PricingView'));

const FONT_SIZE_SCALE: Record<FontSize, number> = { small: 0.87, medium: 1, large: 1.13 };

function resolveEffectiveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const { inputDirtyRef, scrollRef, scrollPositionRef, shortcutsTrapRef, ...s } = useAppState();

  // Bootstrap: mount-only effects consolidated into a single hook
  useBootstrapEffects({
    lang: s.lang,
    showToast: s.showToast,
    setShowReportReminder: s.setShowReportReminder,
    setSelectedId: s.setSelectedId,
    setInputKey: s.setInputKey,
    inputDirtyRef: inputDirtyRef,
    setView: s.setView,
    setShowOnboarding: s.setShowOnboarding,
    setOfflineStatus: s.setOfflineStatus,
    setOfflineDismissed: s.setOfflineDismissed,
    setShowScrollTop: s.setShowScrollTop,
    scrollRef: scrollRef,
    refreshLogs: s.refreshLogs,
    logs: s.logs,
  });

  // Cache isDemoMode to avoid reading localStorage every render
  const [demoMode, setDemoModeState] = useState(() => isDemoMode());

  // Aria-live view transition announcements (derived from view + lang)
  const viewAnnouncement = useMemo(() => {
    const viewLabelMap: Partial<Record<View, string>> = {
      input: t('tabTitleInput', s.lang),
      detail: t('tabTitleDetail', s.lang),
      dashboard: t('tabTitleDashboard', s.lang),
      history: t('tabTitleHistory', s.lang),
      todos: t('tabTitleTodos', s.lang),
      timeline: t('tabTitleTimeline', s.lang),
      projects: t('tabTitleProjects', s.lang),
      settings: t('tabTitleSettings', s.lang),
      help: t('tabTitleHelp', s.lang),
      pricing: t('tabTitlePricing', s.lang),
      masternote: t('tabTitleMasternote', s.lang),
      projecthome: t('tabTitleProjecthome', s.lang),
      weeklyreport: t('tabTitleWeeklyreport', s.lang),
      trash: t('tabTitleTrash', s.lang),
      summarylist: t('tabTitleSummarylist', s.lang),
      knowledgebase: t('tabTitleKnowledgebase', s.lang),
    };
    return viewLabelMap[s.view] || s.view;
  }, [s.view, s.lang]);

  // Tab title: show pending TODO count + current view
  useEffect(() => {
    const viewTitleMap: Partial<Record<View, string>> = {
      dashboard: `${t('tabTitleDashboard', s.lang)} — Lore`,
      todos: `${t('tabTitleTodos', s.lang)} — Lore`,
      history: `${t('tabTitleHistory', s.lang)} — Lore`,
      timeline: `${t('tabTitleTimeline', s.lang)} — Lore`,
      projects: `${t('tabTitleProjects', s.lang)} — Lore`,
      settings: `${t('tabTitleSettings', s.lang)} — Lore`,
      help: `${t('tabTitleHelp', s.lang)} — Lore`,
      pricing: `${t('tabTitlePricing', s.lang)} — Lore`,
    };
    if (s.view === 'detail') return;
    const base = viewTitleMap[s.view] || 'Lore';
    document.title = s.pendingCount > 0 ? `(${s.pendingCount}) ${base}` : base;
  }, [s.pendingCount, s.view, s.lang]);

  // Apply font size via CSS transform scale on #root
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const scale = FONT_SIZE_SCALE[s.fontSize];
    if (scale === 1) {
      root.style.transform = '';
      root.style.transformOrigin = '';
      root.style.width = '';
      root.style.height = '100vh';
    } else {
      root.style.transform = `scale(${scale})`;
      root.style.webkitTransform = `scale(${scale})`;
      root.style.transformOrigin = 'top left';
      root.style.webkitTransformOrigin = 'top left';
      root.style.width = `${100 / scale}%`;
      root.style.height = `${100 / scale}vh`;
    }
  }, [s.fontSize]);

  // Save last view to localStorage
  useEffect(() => {
    safeSetItem(s.LAST_VIEW_KEY, s.view);
  }, [s.view, s.LAST_VIEW_KEY]);

  useEffect(() => {
    if (s.activeProjectId) safeSetItem(s.LAST_PROJECT_KEY, s.activeProjectId);
    else safeRemoveItem(s.LAST_PROJECT_KEY);
  }, [s.activeProjectId, s.LAST_PROJECT_KEY]);

  // Warn user when localStorage quota is exceeded
  useEffect(() => {
    const handler = () => s.showToast(t('storageFullWarning', s.lang), 'error');
    window.addEventListener('lore-storage-full', handler);
    return () => window.removeEventListener('lore-storage-full', handler);
  }, [s.lang, s.showToast]);

  // Apply data-theme attribute
  useEffect(() => {
    const apply = () => {
      const effective = resolveEffectiveTheme(s.themePref);
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply();

    if (s.themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      const timer = setInterval(apply, 60 * 60 * 1000);
      return () => { mq.removeEventListener('change', apply); clearInterval(timer); };
    }
  }, [s.themePref]);

  // Sync html lang attribute with current UI language
  useEffect(() => {
    document.documentElement.lang = s.lang;
  }, [s.lang]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!getFeatureEnabled('keyboard_shortcuts', true)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') { e.preventDefault(); s.setPaletteOpen((v: boolean) => !v); return; }
      if (mod && e.key === 'n') { e.preventDefault(); s.handleNewLog(); return; }
      if (mod && e.key === ',') { e.preventDefault(); s.goToRaw('settings'); return; }

      const active = document.activeElement;
      const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

      if (e.key === '?' && !mod && !inInput) { e.preventDefault(); s.setShortcutsOpen((v: boolean) => !v); return; }

      if (e.key === 'Escape') {
        if (s.shortcutsOpen) { s.setShortcutsOpen(false); return; }
        if (s.paletteOpen) { s.setPaletteOpen(false); return; }
        if (inInput) return;
        if (document.querySelector('.modal-overlay, .action-sheet-overlay, .context-menu, .confirm-dialog')) return;
        if (s.view !== 'input') {
          e.preventDefault();
          if (s.view === 'detail') {
            s.goToRaw(s.prevView === 'detail' ? (s.activeProjectId ? 'projecthome' : 'history') : s.prevView);
          } else if (s.view === 'projecthome') {
            s.setActiveProjectId(null);
            s.goToRaw('input');
          } else {
            s.goToRaw(s.prevView === s.view ? 'input' : s.prevView);
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [s.paletteOpen, s.shortcutsOpen, s.view, s.prevView, s.activeProjectId, s.handleNewLog, s.goToRaw, s.setPaletteOpen, s.setShortcutsOpen, s.setActiveProjectId]);

  // Restore scroll position when view changes
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const positions = scrollPositionRef.current;
    requestAnimationFrame(() => {
      if (scrollEl) {
        const saved = positions[s.view];
        scrollEl.scrollTo(0, saved || 0);
      }
    });
  }, [s.view, scrollRef, scrollPositionRef]);

  const backTo = (v: View) => () => s.goTo(s.prevView === v ? 'input' : s.prevView);
  const activeProject = useMemo(
    () => s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined,
    [s.activeProjectId, s.projects],
  );

  const viewRouteMap: Partial<Record<View, () => React.ReactElement | null>> = {
    settings: () => <SettingsPanel onBack={backTo('settings')} lang={s.lang} onUiLangChange={s.handleUiLangChange} themePref={s.themePref} onThemeChange={s.handleThemeChange} fontSize={s.fontSize} onFontSizeChange={s.handleFontSizeChange} showToast={s.showToast} onShowOnboarding={() => s.setShowOnboarding(true)} onResumeOnboarding={s.onboardingPausedForSettings ? () => { s.setOnboardingPausedForSettings(false); s.setShowOnboarding(true); } : undefined} />,
    help: () => <HelpView onBack={backTo('help')} lang={s.lang} onShowOnboarding={() => s.setShowOnboarding(true)} onFeedback={() => s.setHelpFeedbackOpen(true)} />,
    pricing: () => <PricingView onBack={backTo('pricing')} lang={s.lang} showToast={s.showToast} />,
    history: () => <HistoryView logs={s.logs} onSelect={s.handleSelect} onBack={s.handleGoToInput} onRefresh={s.refreshLogs} lang={s.lang} activeProjectId={s.activeProjectId} projects={s.projects} showToast={s.showToast} onOpenMasterNote={s.handleOpenMasterNote} onOpenProject={s.handleOpenProjectLogs} tagFilter={s.tagFilter} onClearTagFilter={() => s.setTagFilter(null)} onTagFilter={s.setTagFilter} onDuplicate={(newId: string) => { s.refreshLogs(); s.handleSelect(newId); }} />,
    todos: () => <TodoView logs={s.logs} onBack={backTo('todos')} onOpenLog={s.handleSelect} lang={s.lang} showToast={s.showToast} />,
    dashboard: () => <DashboardView logs={s.logs} projects={s.projects} todos={s.todos} masterNotes={s.masterNotes} lang={s.lang} onOpenLog={s.handleSelect} onOpenProject={s.handleOpenProjectLogs} onOpenTodos={s.handleGoToTodos} onOpenSummaryList={s.handleGoToSummaryList} onOpenHistory={s.handleGoToHistory} onNewLog={s.handleGoToInput} onToggleAction={s.handleDashboardToggleAction} />,
    timeline: () => <TimelineView logs={s.logs} projects={s.projects} todos={s.todos} masterNotes={s.masterNotes} onBack={backTo('timeline')} onOpenLog={s.handleSelect} onOpenProject={s.handleOpenProjectLogs} onOpenSummary={s.handleOpenMasterNote} onNewLog={() => s.goTo('input')} lang={s.lang} />,
    weeklyreport: () => <WeeklyReportView logs={s.logs} projects={s.projects} todos={s.todos} onBack={backTo('weeklyreport')} lang={s.lang} showToast={s.showToast} />,
    trash: () => <TrashView onBack={backTo('trash')} onRefresh={s.refreshLogs} lang={s.lang} showToast={s.showToast} />,
    summarylist: () => <ProjectSummaryListView projects={s.projects} logs={s.logs} onBack={backTo('summarylist')} onOpenSummary={s.handleOpenMasterNote} lang={s.lang} />,
    projects: () => <ProjectsView projects={s.projects} logs={s.logs} onBack={backTo('projects')} onSelectProject={s.handleOpenProjectLogs} onOpenMasterNote={s.handleOpenMasterNote} onRefresh={s.refreshLogs} lang={s.lang} showToast={s.showToast} />,
    projecthome: () => {
      if (!activeProject) return null;
      return <ProjectHomeView project={activeProject} logs={s.logs} onBack={() => { s.setActiveProjectId(null); s.goTo('input'); }} onOpenLog={s.handleSelect} onOpenSummary={s.handleOpenMasterNote} onOpenKnowledgeBase={s.handleOpenKnowledgeBase} onNewLog={s.handleNewLog} onRefresh={s.refreshLogs} lang={s.lang} showToast={s.showToast} />;
    },
    masternote: () => {
      if (!activeProject) return null;
      const latestHandoff = s.logs
        .filter((l) => l.projectId === s.activeProjectId && l.outputMode === 'handoff')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || undefined;
      return <MasterNoteView project={activeProject} logs={s.logs} latestHandoff={latestHandoff} onBack={backTo('masternote')} onOpenLog={s.handleSelect} lang={s.lang} showToast={s.showToast} />;
    },
    knowledgebase: () => {
      if (!activeProject) return null;
      return <KnowledgeBaseView project={activeProject} logs={s.logs} onBack={backTo('knowledgebase')} onOpenLog={s.handleSelect} lang={s.lang} showToast={s.showToast} />;
    },
  };

  const defaultWorkspace = <ErrorBoundary key={`workspace-${s.inputKey}`} onGoHome={s.goHome}><Workspace key={s.inputKey} mode={s.view === 'detail' ? 'detail' : 'input'} selectedId={s.selectedId} onSaved={s.handleSaved} onDeleted={s.handleDeleted} onOpenLog={s.handleSelect} onBack={s.handleBack} prevView={s.prevView} lang={s.lang} activeProjectId={s.activeProjectId} projects={s.projects} onRefresh={s.refreshLogs} showToast={s.showToast} onDirtyChange={(dirty: boolean) => { s.setInputDirty(dirty); }} onTagFilter={s.handleTagFilter} onOpenMasterNote={s.handleOpenMasterNote} allLogs={s.logs} pendingTodosCount={s.pendingTodosCount} lastLogCreatedAt={s.lastLogCreatedAt} /></ErrorBoundary>;

  const renderWorkspace = () => {
    const routeFactory = viewRouteMap[s.view];
    if (!routeFactory) return defaultWorkspace;
    const content = routeFactory();
    if (!content) return defaultWorkspace;
    const key = s.activeProjectId && (s.view === 'projecthome' || s.view === 'masternote' || s.view === 'knowledgebase')
      ? `${s.view}-${s.activeProjectId}` : s.view;
    return <ErrorBoundary key={key} onGoHome={s.goHome}>{content}</ErrorBoundary>;
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
      >
        {viewAnnouncement}
      </div>
      {!s.sidebarOpen && !s.sidebarHidden && (
        <div style={{ width: 48, minWidth: 48, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 4, background: 'transparent' }}>
          <button className="toggle-btn" onClick={() => { s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); }} title={t('showSidebar', s.lang)} aria-label={t('ariaShowSidebar', s.lang)}>
            <Menu size={18} />
          </button>
        </div>
      )}
      {!s.sidebarOpen && s.sidebarHidden && (
        <button
          className="mobile-menu-btn"
          onClick={() => { s.setSidebarHidden(false); s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); }}
          title={t('showSidebar', s.lang)}
          aria-label={t('ariaShowSidebar', s.lang)}
        >
          <Menu size={20} />
        </button>
      )}
      {s.sidebarHidden && (
        <div
          className="sidebar-reveal-bar"
          onClick={() => { s.setSidebarHidden(false); s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); }}
          title={t('showSidebar', s.lang)}
          role="button"
          tabIndex={0}
          aria-label={t('ariaShowSidebar', s.lang)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.setSidebarHidden(false); s.setSidebarOpen(true); safeSetItem(s.SIDEBAR_KEY, 'open'); } }}
        />
      )}
      {s.sidebarOpen && (
        <aside aria-label="Sidebar"><Sidebar
          logs={s.logs} projects={s.projects} todos={s.todos} selectedId={s.selectedId}
          activeProjectId={s.activeProjectId}
          activeView={s.view}
          onSelect={s.handleSelect} onNewLog={s.handleNewLog}
          onOpenSettings={s.handleGoToSettings}
          onOpenHistory={s.handleGoToHistory}
          onOpenProjects={s.handleGoToProjects}
          onOpenTodos={s.handleGoToTodos}
          onOpenProjectSummaryList={s.handleGoToSummaryList}
          onOpenDashboard={s.handleGoToDashboard}
          onOpenTimeline={s.handleGoToTimeline}
          onOpenWeeklyReport={s.handleGoToWeeklyReport}
          onOpenTrash={s.handleGoToTrash}
          onOpenHelp={s.handleGoToHelp}
          onOpenPricing={s.handleGoToPricing}
          onCollapse={s.handleCollapseSidebar}
          onHide={s.handleHideSidebar}
          onSelectProject={s.handleOpenProjectLogs}
          onOpenMasterNote={s.handleOpenMasterNote}
          onRefresh={s.refreshLogs}
          onDeleted={s.handleDeleted}
          lang={s.lang}
          showToast={s.showToast}
          masterNotes={s.masterNotes}
        /></aside>
      )}
      <main id="main-content" tabIndex={-1} ref={scrollRef} data-main-scroll style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: 'var(--bg-app)', outline: 'none' }}>
        {demoMode && (
          <div style={{ background: 'var(--accent-bg, rgba(99,102,241,0.08))', borderBottom: '1px solid var(--accent)', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('demoBadge', s.lang)}</span>
            <span style={{ color: 'var(--text-muted)' }}>{t('demoModeBanner', s.lang)}</span>
            <button
              className="btn"
              onClick={() => { setDemoMode(false); setDemoModeState(false); s.setLogsVersion((v: number) => v + 1); }}
              style={{ fontSize: 12, padding: '2px 10px', color: 'var(--accent)', minHeight: 44 }}
            >
              {t('exitDemoMode', s.lang)}
            </button>
          </div>
        )}
        <div style={{ height: '100%' }}>
          <Suspense fallback={<SkeletonLoader lang={s.lang} variant={s.view === 'dashboard' ? 'card' : s.view === 'detail' ? 'detail' : 'list'} />}>
            <div className="view-fade-in" key={s.view}>
              {renderWorkspace()}
            </div>
          </Suspense>
        </div>
      </main>
      <button
        className={`scroll-to-top${s.showScrollTop ? ' visible' : ''}`}
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label={t('ariaScrollToTop', s.lang)}
      >
        <ChevronUp size={18} />
      </button>
      {s.showOverdueBanner && (
        <div className="overdue-banner" role="alert">
          <span>
            {tf('overdueBanner', s.lang, s.overdueTodos.length)}
          </span>
          <button
            className="overdue-banner-link"
            onClick={() => s.goTo('todos')}
          >
            {t('overdueBannerLink', s.lang)}
          </button>
          <button
            className="overdue-banner-close"
            onClick={() => {
              s.setBannerDismissed(true);
              safeSetItem('threadlog_overdue_dismissed', s.todayKey);
            }}
            aria-label={t('close', s.lang)}
          >
            x
          </button>
        </div>
      )}
      {s.showReportReminder && (
        <div className="overdue-banner" role="alert">
          <span>{t('weeklyReportReminder', s.lang)}</span>
          <button
            className="overdue-banner-link"
            onClick={() => {
              s.setShowReportReminder(false);
              setLastReportDate(Date.now());
              s.goToRaw('weeklyreport');
            }}
          >
            {t('generateNow', s.lang)}
          </button>
          <button
            className="overdue-banner-close"
            onClick={() => s.setShowReportReminder(false)}
            aria-label={t('close', s.lang)}
          >
            x
          </button>
        </div>
      )}
      <BottomNav
        activeView={s.view}
        onNavigate={s.handleBottomNav}
        lang={s.lang}
      />
      {s.offlineStatus !== 'online' && !s.offlineDismissed && (
        <div role="alert" aria-live="assertive" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: s.offlineStatus === 'offline' ? 'var(--warning-bg, #f59e0b)' : 'var(--success-bg, #22c55e)',
          color: s.offlineStatus === 'offline' ? 'var(--warning-text, #78350f)' : 'var(--success-text, #052e16)',
          textAlign: 'center', fontSize: 12, padding: '4px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'opacity 0.3s',
        }}>
          <span>{s.offlineStatus === 'offline' ? t('offline', s.lang) : t('backOnline', s.lang)}</span>
          {s.offlineStatus === 'offline' && (
            <button
              onClick={() => s.setOfflineDismissed(true)}
              aria-label={t('close', s.lang)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'inherit', fontSize: 14, lineHeight: 1, padding: '0 4px',
                minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              x
            </button>
          )}
        </div>
      )}
      <Toast {...s.toast} />
      {s.paletteOpen && (
        <CommandPalette
          logs={s.logs}
          projects={s.projects}
          masterNotes={s.masterNotes}
          onSelectLog={s.handleSelect}
          onSelectProject={s.handlePaletteSelectProject}
          onSelectSummary={s.handleOpenMasterNote}
          onClose={() => s.setPaletteOpen(false)}
          lang={s.lang}
          onNavigate={(view: View) => { s.setPaletteOpen(false); s.goTo(view); }}
          onToggleTheme={(theme: ThemePref) => { s.handleThemeChange(theme); }}
          onNewProject={() => { s.setPaletteOpen(false); s.goTo('projects'); }}
        />
      )}
      {s.showOnboarding && (
        <Onboarding
          lang={s.lang}
          onLangChange={s.handleUiLangChange}
          onClose={s.handleOnboardingClose}
          onPauseForSettings={() => {
            s.setShowOnboarding(false);
            s.setOnboardingPausedForSettings(true);
            s.goTo('settings');
          }}
          initialStep={(() => {
            return parseInt(safeGetItem('threadlog_onboarding_step') || '0', 10);
          })()}
        />
      )}
      {s.helpFeedbackOpen && (
        <FeedbackModal lang={s.lang} onClose={() => s.setHelpFeedbackOpen(false)} />
      )}
      {s.pendingNav && (
        <ConfirmDialog
          title={t('unsavedInputTitle', s.lang)}
          description={t('unsavedInputDesc', s.lang)}
          confirmLabel={t('unsavedInputConfirm', s.lang)}
          cancelLabel={t('cancel', s.lang)}
          danger={false}
          onConfirm={() => { const nav = s.pendingNav; s.setPendingNav(null); s.clearInputDirty(); nav!(); }}
          onCancel={() => s.setPendingNav(null)}
        />
      )}
      {s.shortcutsOpen && (
        <div className="modal-overlay" onClick={() => s.setShortcutsOpen(false)}>
          <div ref={shortcutsTrapRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-label={t('shortcutsTitle', s.lang)} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('shortcutsTitle', s.lang)}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { keys: '\u2318 N', desc: t('shortcutNewLog', s.lang) },
                { keys: '\u2318 K', desc: t('shortcutSearch', s.lang) },
                { keys: '\u2318 ,', desc: t('shortcutSettings', s.lang) },
                { keys: '\u2318 Enter', desc: t('shortcutSubmit', s.lang) },
                { keys: '?', desc: t('shortcutShortcuts', s.lang) },
                { keys: 'Esc', desc: t('shortcutEscape', s.lang) },
              ]).map((item) => (
                <div key={item.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-body)' }}>{item.desc}</span>
                  <kbd style={{
                    fontSize: 12, fontFamily: 'inherit', padding: '2px 8px',
                    borderRadius: 4, background: 'var(--bg-sidebar)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', minWidth: 32, textAlign: 'center',
                  }}>{item.keys}</kbd>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button className="btn" onClick={() => s.setShortcutsOpen(false)} style={{ fontSize: 13 }}>
                {t('close', s.lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
