import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Menu, ChevronUp } from 'lucide-react';
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import CommandPalette from './CommandPalette';
import BottomNav from './BottomNav';
import { Toast } from './Toast';
import { useToast } from './useToast';
import ConfirmDialog from './ConfirmDialog';
import Onboarding from './Onboarding';
import ErrorBoundary from './ErrorBoundary';
import FeedbackModal from './FeedbackModal';
import { isOnboardingDone } from './onboardingState';
import { isSampleSeeded } from './sampleData';
import { useFocusTrap } from './useFocusTrap';

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
import { loadLogs, loadProjects, loadTodos, loadMasterNotes, getUiLang, setUiLang, getTheme, setTheme as saveTheme, purgeExpiredTrash, updateLog, getLog, getAutoReportSetting, getLastReportDate, setLastReportDate, isDemoMode, setDemoMode, getFeatureEnabled, recordActivity, safeGetItem, safeSetItem, safeRemoveItem } from './storage';
import type { ThemePref } from './storage';
import type { FontSize } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { registerSW } from 'virtual:pwa-register';

const FONT_SIZE_KEY = 'threadlog_font_size';
const LAST_VIEW_KEY = 'threadlog_last_view';
const LAST_PROJECT_KEY = 'threadlog_last_project';
const SIDEBAR_KEY = 'threadlog_sidebar';

const FONT_SIZE_SCALE: Record<FontSize, number> = { small: 0.87, medium: 1, large: 1.13 };

export type View = 'input' | 'detail' | 'settings' | 'history' | 'masternote' | 'projects' | 'todos' | 'trash' | 'summarylist' | 'projecthome' | 'timeline' | 'help' | 'weeklyreport' | 'knowledgebase' | 'dashboard' | 'pricing';

function resolveUiLang(): Lang {
  return getUiLang();
}

function resolveEffectiveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  // Use OS preference via media query
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [view, setView] = useState<View>(() => {
    const saved = safeGetItem(LAST_VIEW_KEY);
    if (saved && saved !== 'detail' && saved !== 'masternote' && saved !== 'projecthome' && saved !== 'knowledgebase') return saved as View;
    return 'input';
  });
  const [prevView, setPrevView] = useState<View>('input');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = safeGetItem(SIDEBAR_KEY);
    return saved !== 'hidden' && saved !== 'collapsed';
  });
  const [sidebarHidden, setSidebarHidden] = useState(() => safeGetItem(SIDEBAR_KEY) === 'hidden');
  const [logsVersion, setLogsVersion] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const [lang, setLangState] = useState<Lang>(resolveUiLang);
  const [themePref, setThemePref] = useState<ThemePref>(getTheme);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => safeGetItem(LAST_PROJECT_KEY) || null);
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = safeGetItem(FONT_SIZE_KEY);
    if (saved === 'small' || saved === 'medium' || saved === 'large') return saved;
    return 'medium';
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { toast, showToast } = useToast();
  const inputDirtyRef = useRef(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const scrollPositionRef = useRef<Record<string, number>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingPausedForSettings, setOnboardingPausedForSettings] = useState(false);
  const [helpFeedbackOpen, setHelpFeedbackOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsTrapRef = useFocusTrap<HTMLDivElement>(shortcutsOpen);
  const [showReportReminder, setShowReportReminder] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<'online' | 'offline' | 'back'>(() =>
    navigator.onLine ? 'online' : 'offline'
  );
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Offline / online detection
  useEffect(() => {
    let onlineTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOffline = () => { setOfflineStatus('offline'); setOfflineDismissed(false); };
    const handleOnline = () => {
      setOfflineStatus('back');
      onlineTimer = setTimeout(() => setOfflineStatus('online'), 3000);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (onlineTimer) clearTimeout(onlineTimer);
    };
  }, []);

  // Scroll-to-top button visibility
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollTop(el.scrollTop > 400);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // PWA service worker update notification
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        showToast(t('updateAvailable', lang), 'default', {
          label: t('updateReload', lang),
          onClick: () => { updateSW(); },
        });
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logs = useMemo(() => loadLogs(), [logsVersion]);
  const projects = useMemo(() => loadProjects(), [logsVersion]);
  const todos = useMemo(() => loadTodos(), [logsVersion]);
  const masterNotes = useMemo(() => loadMasterNotes(), [logsVersion]);
  const pendingTodosCount = useMemo(() => todos.filter((td) => !td.done && !td.archivedAt).length, [todos]);
  const lastLogCreatedAt = useMemo(() => logs.length > 0 ? logs[logs.length - 1].createdAt : null, [logs]);


  // Tab title: show pending TODO count + current view
  const pendingCount = useMemo(() => todos.filter((td) => !td.done).length, [todos]);
  useEffect(() => {
    const viewTitleMap: Partial<Record<View, string>> = {
      dashboard: `${t('tabTitleDashboard', lang)} — Lore`,
      todos: `${t('tabTitleTodos', lang)} — Lore`,
      history: `${t('tabTitleHistory', lang)} — Lore`,
      timeline: `${t('tabTitleTimeline', lang)} — Lore`,
      projects: `${t('tabTitleProjects', lang)} — Lore`,
      settings: `${t('tabTitleSettings', lang)} — Lore`,
      help: `${t('tabTitleHelp', lang)} — Lore`,
      pricing: `${t('tabTitlePricing', lang)} — Lore`,
    };
    // detail view: keep current title unchanged
    if (view === 'detail') return;
    const base = viewTitleMap[view] || 'Lore';
    document.title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base;
  }, [pendingCount, view, lang]);

  // Overdue TODO banner
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdueTodos = useMemo(() => {
    return todos.filter((td) => !td.done && td.dueDate && td.dueDate < todayKey);
  }, [todos, todayKey]);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    safeGetItem('threadlog_overdue_dismissed') === todayKey
  );
  const showOverdueBanner = overdueTodos.length > 0 && !bannerDismissed;

  // Apply font size via CSS transform scale on #root (cross-browser compatible)
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const s = FONT_SIZE_SCALE[fontSize];
    if (s === 1) {
      root.style.transform = '';
      root.style.transformOrigin = '';
      root.style.width = '';
      root.style.height = '100vh';
    } else {
      root.style.transform = `scale(${s})`;
      root.style.webkitTransform = `scale(${s})`;
      root.style.transformOrigin = 'top left';
      root.style.webkitTransformOrigin = 'top left';
      root.style.width = `${100 / s}%`;
      root.style.height = `${100 / s}vh`;
    }
  }, [fontSize]);

  const handleFontSizeChange = (size: FontSize) => {
    setFontSizeState(size);
    safeSetItem(FONT_SIZE_KEY, size);
  };

  // Save last view to localStorage
  useEffect(() => {
    safeSetItem(LAST_VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    if (activeProjectId) safeSetItem(LAST_PROJECT_KEY, activeProjectId);
    else safeRemoveItem(LAST_PROJECT_KEY);
  }, [activeProjectId]);

  // Purge expired trash on app load
  useEffect(() => { purgeExpiredTrash(); }, []);

  // Record daily activity for streak tracking
  useEffect(() => { recordActivity(); }, []);

  // Warn user when localStorage quota is exceeded
  useEffect(() => {
    const handler = () => showToast(t('storageFullWarning', lang), 'error');
    window.addEventListener('lore-storage-full', handler);
    return () => window.removeEventListener('lore-storage-full', handler);
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto weekly report reminder on app load
  useEffect(() => {
    if (!getAutoReportSetting()) return;
    const last = getLastReportDate();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (last === null || Date.now() - last >= sevenDays) {
      setShowReportReminder(true);
    }
  }, []);


  // Chrome extension import: navigate to Create Log when #import= hash is detected
  useEffect(() => {
    const handleExtensionImport = () => {
      if (window.location.hash.startsWith('#import=')) {
        // Force navigate to input view so Workspace mounts and handles the import
        setSelectedId(null);
        setInputKey((k) => k + 1);
        inputDirtyRef.current = false;
        setView('input');
        showToast(t('extensionReceived', lang), 'success');
      }
    };
    // Check on mount (in case app loaded with hash already set)
    handleExtensionImport();
    window.addEventListener('hashchange', handleExtensionImport);
    return () => window.removeEventListener('hashchange', handleExtensionImport);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show onboarding on first launch (0 logs + flag not set)
  useEffect(() => {
    if (logs.length === 0 && !isOnboardingDone()) {
      setShowOnboarding(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  const handleOnboardingClose = useCallback(async () => {
    const isFirstLaunch = !isSampleSeeded();
    if (isFirstLaunch) {
      const { seedSampleData } = await import('./sampleData');
      seedSampleData(lang);
      setLogsVersion((v) => v + 1);
    }
    setShowOnboarding(false);
    if (isFirstLaunch) {
      goToRaw('dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- goToRaw is stable (depends on setState only)
  }, [lang]);

  // Apply data-theme attribute; listen for OS theme changes when in "system" mode
  useEffect(() => {
    const apply = () => {
      const effective = resolveEffectiveTheme(themePref);
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply();

    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      // Also re-check hourly as a fallback
      const timer = setInterval(apply, 60 * 60 * 1000);
      return () => { mq.removeEventListener('change', apply); clearInterval(timer); };
    }
  }, [themePref]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!getFeatureEnabled('keyboard_shortcuts', true)) return;
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+K: toggle command palette
      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // Cmd+N: new log
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNewLog();
        return;
      }
      // Cmd+,: settings
      if (mod && e.key === ',') {
        e.preventDefault();
        goToRaw('settings');
        return;
      }

      // Don't handle non-modifier keys if input/textarea focused
      const active = document.activeElement;
      const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

      // ?: show shortcuts (only when not typing)
      if (e.key === '?' && !mod && !inInput) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (e.key === 'Escape') {
        // Priority: close shortcuts modal, then palette
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (inInput) return;
        if (document.querySelector('.modal-overlay, .action-sheet-overlay, .context-menu, .confirm-dialog')) return;
        if (view !== 'input') {
          e.preventDefault();
          if (view === 'detail') {
            goToRaw(prevView === 'detail' ? (activeProjectId ? 'projecthome' : 'history') : prevView);
          } else if (view === 'projecthome') {
            setActiveProjectId(null);
            goToRaw('input');
          } else {
            goToRaw(prevView === view ? 'input' : prevView);
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen, shortcutsOpen, view, prevView, activeProjectId]);

  const handleThemeChange = (v: ThemePref) => {
    setThemePref(v);
    saveTheme(v);
  };

  const refreshLogs = useCallback(() => setLogsVersion((v) => v + 1), []);

  // Multi-tab localStorage sync: reload data when another tab changes storage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'threadlog_logs' ||
        e.key === 'threadlog_projects' ||
        e.key === 'threadlog_todos' ||
        e.key === 'threadlog_master_notes'
      ) {
        refreshLogs();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshLogs]);

  // Warn user before closing tab with unsaved input
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (inputDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const goToRaw = useCallback((next: View) => {
    // Save current scroll position before navigating away
    if (scrollRef.current) {
      scrollPositionRef.current[view] = scrollRef.current.scrollTop;
    }
    setPrevView(view);
    setView(next);
  }, [view]);

  // Restore scroll position when view changes (or reset to 0 for fresh views)
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        const saved = scrollPositionRef.current[view];
        scrollRef.current.scrollTo(0, saved || 0);
      }
    });
  }, [view]);

  // Navigation with dirty-input guard: only guard when leaving the input view
  const goTo = useCallback((next: View) => {
    if (view === 'input' && inputDirtyRef.current && next !== 'input') {
      setPendingNav(() => () => goToRaw(next));
      return;
    }
    goToRaw(next);
  }, [view, goToRaw]);

  const handleSelect = useCallback((id: string) => {
    const doNav = () => { setSelectedId(id); goToRaw('detail'); setPaletteOpen(false); };
    if (view === 'input' && inputDirtyRef.current) {
      setPendingNav(() => doNav);
      return;
    }
    doNav();
  }, [view, goToRaw]);
  const handleNewLog = useCallback(() => { setSelectedId(null); setInputKey((k) => k + 1); goToRaw('input'); inputDirtyRef.current = false; }, [goToRaw]);
  const handleSaved = useCallback((id: string) => { setSelectedId(id); refreshLogs(); inputDirtyRef.current = false; }, [refreshLogs]);
  const handleDeleted = useCallback(() => { setSelectedId(null); setInputKey((k) => k + 1); goToRaw('input'); refreshLogs(); showToast(t('deleted', lang), 'success'); inputDirtyRef.current = false; }, [goToRaw, refreshLogs, showToast, lang]);
  const handleBack = useCallback(() => { goTo(prevView === 'detail' ? (activeProjectId ? 'projecthome' : 'history') : prevView); }, [goTo, prevView, activeProjectId]);

  const handleUiLangChange = (v: Lang) => {
    setUiLang(v);
    setLangState(v);
  };

  const handleTagFilter = (tag: string) => {
    setTagFilter(tag);
    setActiveProjectId(null);
    goToRaw('history');
  };

  const handleOpenMasterNote = (projectId: string) => {
    setActiveProjectId(projectId);
    goTo('masternote');
  };

  const handleOpenKnowledgeBase = (projectId: string) => {
    setActiveProjectId(projectId);
    goTo('knowledgebase');
  };

  const handleOpenProjectLogs = (projectId: string) => {
    setActiveProjectId(projectId);
    goTo('projecthome');
    setPaletteOpen(false);
  };

  const handlePaletteSelectProject = (projectId: string) => {
    handleOpenProjectLogs(projectId);
  };

  const goHome = useCallback(() => { setSelectedId(null); setInputKey((k) => k + 1); inputDirtyRef.current = false; goToRaw('input'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable callbacks for memo'd child components
  const handleGoToSettings = useCallback(() => goTo('settings' as View), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToHistory = useCallback(() => { setActiveProjectId(null); setView('history'); }, []);
  const handleGoToProjects = useCallback(() => goTo('projects'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToTodos = useCallback(() => goTo('todos'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToSummaryList = useCallback(() => goTo('summarylist'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToDashboard = useCallback(() => goTo('dashboard'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToTimeline = useCallback(() => goTo('timeline'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToWeeklyReport = useCallback(() => goTo('weeklyreport'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToTrash = useCallback(() => goTo('trash'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToHelp = useCallback(() => goTo('help'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToPricing = useCallback(() => goTo('pricing'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleGoToInput = useCallback(() => goTo('input'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleCollapseSidebar = useCallback(() => { setSidebarOpen(false); safeSetItem(SIDEBAR_KEY, 'collapsed'); }, []);
  const handleHideSidebar = useCallback(() => { setSidebarOpen(false); setSidebarHidden(true); safeSetItem(SIDEBAR_KEY, 'hidden'); }, []);
  const handleBottomNav = useCallback((v: View) => {
    if (v === 'input') { handleNewLog(); }
    else if (v === 'settings') { goTo('settings'); }
    else { goTo(v); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleDashboardToggleAction = useCallback((logId: string, actionIndex: number) => {
    const log = getLog(logId);
    if (!log) return;
    const current = log.checkedActions || [];
    const next = current.includes(actionIndex) ? current.filter((i: number) => i !== actionIndex) : [...current, actionIndex];
    updateLog(logId, { checkedActions: next });
    refreshLogs();
  }, [refreshLogs]);

  const renderWorkspace = () => {
    if (view === 'settings') return <ErrorBoundary key="settings" onGoHome={goHome}><SettingsPanel onBack={() => goTo(prevView === 'settings' ? 'input' : prevView)} lang={lang} onUiLangChange={handleUiLangChange} themePref={themePref} onThemeChange={handleThemeChange} fontSize={fontSize} onFontSizeChange={handleFontSizeChange} showToast={showToast} onShowOnboarding={() => setShowOnboarding(true)} onResumeOnboarding={onboardingPausedForSettings ? () => { setOnboardingPausedForSettings(false); setShowOnboarding(true); } : undefined} /></ErrorBoundary>;
    if (view === 'help') return <ErrorBoundary key="help" onGoHome={goHome}><HelpView onBack={() => goTo(prevView === 'help' ? 'input' : prevView)} lang={lang} onShowOnboarding={() => setShowOnboarding(true)} onFeedback={() => setHelpFeedbackOpen(true)} /></ErrorBoundary>;
    if (view === 'pricing') return <ErrorBoundary key="pricing" onGoHome={goHome}><PricingView onBack={() => goTo(prevView === 'pricing' ? 'input' : prevView)} lang={lang} showToast={showToast} /></ErrorBoundary>;
    if (view === 'history') return <ErrorBoundary key="history" onGoHome={goHome}><HistoryView logs={logs} onSelect={handleSelect} onBack={handleGoToInput} onRefresh={refreshLogs} lang={lang} activeProjectId={activeProjectId} projects={projects} showToast={showToast} onOpenMasterNote={handleOpenMasterNote} onOpenProject={handleOpenProjectLogs} tagFilter={tagFilter} onClearTagFilter={() => setTagFilter(null)} onTagFilter={setTagFilter} onDuplicate={(newId) => { refreshLogs(); handleSelect(newId); }} /></ErrorBoundary>;
    if (view === 'todos') return <ErrorBoundary key="todos" onGoHome={goHome}><TodoView logs={logs} onBack={() => goTo(prevView === 'todos' ? 'input' : prevView)} onOpenLog={handleSelect} lang={lang} showToast={showToast} /></ErrorBoundary>;
    if (view === 'dashboard') return <ErrorBoundary key="dashboard" onGoHome={goHome}><DashboardView logs={logs} projects={projects} todos={todos} masterNotes={masterNotes} lang={lang} onOpenLog={handleSelect} onOpenProject={handleOpenProjectLogs} onOpenTodos={handleGoToTodos} onOpenSummaryList={handleGoToSummaryList} onOpenHistory={handleGoToHistory} onNewLog={handleGoToInput} onToggleAction={handleDashboardToggleAction} /></ErrorBoundary>;
    if (view === 'timeline') return <ErrorBoundary key="timeline" onGoHome={goHome}><TimelineView logs={logs} projects={projects} todos={todos} masterNotes={masterNotes} onBack={() => goTo(prevView === 'timeline' ? 'input' : prevView)} onOpenLog={handleSelect} onOpenProject={handleOpenProjectLogs} onOpenSummary={handleOpenMasterNote} onNewLog={() => goTo('input')} lang={lang} /></ErrorBoundary>;
    if (view === 'weeklyreport') return <ErrorBoundary key="weeklyreport" onGoHome={goHome}><WeeklyReportView logs={logs} projects={projects} todos={todos} onBack={() => goTo(prevView === 'weeklyreport' ? 'input' : prevView)} lang={lang} showToast={showToast} /></ErrorBoundary>;
    if (view === 'trash') return <ErrorBoundary key="trash" onGoHome={goHome}><TrashView onBack={() => goTo(prevView === 'trash' ? 'input' : prevView)} onRefresh={refreshLogs} lang={lang} showToast={showToast} /></ErrorBoundary>;
    if (view === 'summarylist') return <ErrorBoundary key="summarylist" onGoHome={goHome}><ProjectSummaryListView projects={projects} logs={logs} onBack={() => goTo(prevView === 'summarylist' ? 'input' : prevView)} onOpenSummary={handleOpenMasterNote} lang={lang} /></ErrorBoundary>;
    if (view === 'projects') return <ErrorBoundary key="projects" onGoHome={goHome}><ProjectsView projects={projects} logs={logs} onBack={() => goTo(prevView === 'projects' ? 'input' : prevView)} onSelectProject={handleOpenProjectLogs} onOpenMasterNote={handleOpenMasterNote} onRefresh={refreshLogs} lang={lang} showToast={showToast} /></ErrorBoundary>;
    if (view === 'projecthome' && activeProjectId) {
      const project = projects.find((p) => p.id === activeProjectId);
      if (project) return <ErrorBoundary key={`projecthome-${activeProjectId}`} onGoHome={goHome}><ProjectHomeView project={project} logs={logs} onBack={() => { setActiveProjectId(null); goTo('input'); }} onOpenLog={handleSelect} onOpenSummary={handleOpenMasterNote} onOpenKnowledgeBase={handleOpenKnowledgeBase} onNewLog={handleNewLog} onRefresh={refreshLogs} lang={lang} showToast={showToast} /></ErrorBoundary>;
    }
    if (view === 'masternote' && activeProjectId) {
      const project = projects.find((p) => p.id === activeProjectId);
      if (project) {
        const latestHandoff = logs
          .filter((l) => l.projectId === activeProjectId && l.outputMode === 'handoff')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || undefined;
        return <ErrorBoundary key={`masternote-${activeProjectId}`} onGoHome={goHome}><MasterNoteView project={project} logs={logs} latestHandoff={latestHandoff} onBack={() => goTo(prevView === 'masternote' ? 'input' : prevView)} onOpenLog={handleSelect} lang={lang} showToast={showToast} /></ErrorBoundary>;
      }
    }
    if (view === 'knowledgebase' && activeProjectId) {
      const project = projects.find((p) => p.id === activeProjectId);
      if (project) return <ErrorBoundary key={`knowledgebase-${activeProjectId}`} onGoHome={goHome}><KnowledgeBaseView project={project} logs={logs} onBack={() => goTo(prevView === 'knowledgebase' ? 'input' : prevView)} onOpenLog={handleSelect} lang={lang} showToast={showToast} /></ErrorBoundary>;
    }
    // Fallback: 'input', 'detail', and any view that couldn't render (e.g. projecthome without activeProjectId)
    return <ErrorBoundary key={`workspace-${inputKey}`} onGoHome={goHome}><Workspace key={inputKey} mode={view === 'detail' ? 'detail' : 'input'} selectedId={selectedId} onSaved={handleSaved} onDeleted={handleDeleted} onOpenLog={handleSelect} onBack={handleBack} prevView={prevView} lang={lang} activeProjectId={activeProjectId} projects={projects} onRefresh={refreshLogs} showToast={showToast} onDirtyChange={(dirty: boolean) => { inputDirtyRef.current = dirty; }} onTagFilter={handleTagFilter} onOpenMasterNote={handleOpenMasterNote} allLogs={logs} pendingTodosCount={pendingTodosCount} lastLogCreatedAt={lastLogCreatedAt} /></ErrorBoundary>;
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {!sidebarOpen && !sidebarHidden && (
        <div style={{ width: 48, minWidth: 48, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 4, background: 'transparent' }}>
          <button className="toggle-btn" onClick={() => { setSidebarOpen(true); safeSetItem(SIDEBAR_KEY, 'open'); }} title={t('showSidebar', lang)} aria-label={t('ariaShowSidebar', lang)}>
            <Menu size={18} />
          </button>
        </div>
      )}
      {!sidebarOpen && sidebarHidden && (
        <button
          className="mobile-menu-btn"
          onClick={() => { setSidebarHidden(false); setSidebarOpen(true); safeSetItem(SIDEBAR_KEY, 'open'); }}
          title={t('showSidebar', lang)}
          aria-label={t('ariaShowSidebar', lang)}
        >
          <Menu size={20} />
        </button>
      )}
      {sidebarHidden && (
        <div
          className="sidebar-reveal-bar"
          onClick={() => { setSidebarHidden(false); setSidebarOpen(true); safeSetItem(SIDEBAR_KEY, 'open'); }}
          title={t('showSidebar', lang)}
          role="button"
          tabIndex={0}
          aria-label={t('ariaShowSidebar', lang)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSidebarHidden(false); setSidebarOpen(true); safeSetItem(SIDEBAR_KEY, 'open'); } }}
        />
      )}
      {sidebarOpen && (
        <aside aria-label="Sidebar"><Sidebar
          logs={logs} projects={projects} todos={todos} selectedId={selectedId}
          activeProjectId={activeProjectId}
          activeView={view}
          onSelect={handleSelect} onNewLog={handleNewLog}
          onOpenSettings={handleGoToSettings}
          onOpenHistory={handleGoToHistory}
          onOpenProjects={handleGoToProjects}
          onOpenTodos={handleGoToTodos}
          onOpenProjectSummaryList={handleGoToSummaryList}
          onOpenDashboard={handleGoToDashboard}
          onOpenTimeline={handleGoToTimeline}
          onOpenWeeklyReport={handleGoToWeeklyReport}
          onOpenTrash={handleGoToTrash}
          onOpenHelp={handleGoToHelp}
          onOpenPricing={handleGoToPricing}
          onCollapse={handleCollapseSidebar}
          onHide={handleHideSidebar}
          onSelectProject={handleOpenProjectLogs}
          onOpenMasterNote={handleOpenMasterNote}
          onRefresh={refreshLogs}
          onDeleted={handleDeleted}
          lang={lang}
          showToast={showToast}
          masterNotes={masterNotes}
        /></aside>
      )}
      <main id="main-content" tabIndex={-1} ref={scrollRef} data-main-scroll style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: 'var(--bg-app)', outline: 'none' }}>
        {isDemoMode() && (
          <div style={{ background: 'var(--accent-bg, rgba(99,102,241,0.08))', borderBottom: '1px solid var(--accent)', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('demoBadge', lang)}</span>
            <span style={{ color: 'var(--text-muted)' }}>{t('demoModeBanner', lang)}</span>
            <button
              className="btn"
              onClick={() => { setDemoMode(false); setLogsVersion((v) => v + 1); }}
              style={{ fontSize: 12, padding: '2px 10px', color: 'var(--accent)' }}
            >
              {t('exitDemoMode', lang)}
            </button>
          </div>
        )}
        <div style={{ height: '100%' }}>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}>
            <div className="view-fade-in" key={view}>
              {renderWorkspace()}
            </div>
          </Suspense>
        </div>
      </main>
      <button
        className={`scroll-to-top${showScrollTop ? ' visible' : ''}`}
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label={t('ariaScrollToTop', lang)}
      >
        <ChevronUp size={18} />
      </button>
      {showOverdueBanner && (
        <div className="overdue-banner" role="alert">
          <span>
            {tf('overdueBanner', lang, overdueTodos.length)}
          </span>
          <button
            className="overdue-banner-link"
            onClick={() => goTo('todos')}
          >
            {t('overdueBannerLink', lang)}
          </button>
          <button
            className="overdue-banner-close"
            onClick={() => {
              setBannerDismissed(true);
              safeSetItem('threadlog_overdue_dismissed', todayKey);
            }}
            aria-label={t('close', lang)}
          >
            ×
          </button>
        </div>
      )}
      {showReportReminder && (
        <div className="overdue-banner" role="alert">
          <span>{t('weeklyReportReminder', lang)}</span>
          <button
            className="overdue-banner-link"
            onClick={() => {
              setShowReportReminder(false);
              setLastReportDate(Date.now());
              goToRaw('weeklyreport');
            }}
          >
            {t('generateNow', lang)}
          </button>
          <button
            className="overdue-banner-close"
            onClick={() => setShowReportReminder(false)}
            aria-label={t('close', lang)}
          >
            ×
          </button>
        </div>
      )}
      <BottomNav
        activeView={view}
        onNavigate={handleBottomNav}
        lang={lang}
      />
      {offlineStatus !== 'online' && !offlineDismissed && (
        <div role="alert" aria-live="assertive" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: offlineStatus === 'offline' ? 'var(--warning-bg, #f59e0b)' : 'var(--success-bg, #22c55e)',
          color: offlineStatus === 'offline' ? 'var(--warning-text, #78350f)' : 'var(--success-text, #052e16)',
          textAlign: 'center', fontSize: 12, padding: '4px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'opacity 0.3s',
        }}>
          <span>{offlineStatus === 'offline' ? t('offline', lang) : t('backOnline', lang)}</span>
          {offlineStatus === 'offline' && (
            <button
              onClick={() => setOfflineDismissed(true)}
              aria-label={t('close', lang)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'inherit', fontSize: 14, lineHeight: 1, padding: '0 4px',
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      <Toast {...toast} />
      {paletteOpen && (
        <CommandPalette
          logs={logs}
          projects={projects}
          masterNotes={masterNotes}
          onSelectLog={handleSelect}
          onSelectProject={handlePaletteSelectProject}
          onSelectSummary={handleOpenMasterNote}
          onClose={() => setPaletteOpen(false)}
          lang={lang}
          onNavigate={(view) => { setPaletteOpen(false); goTo(view); }}
          onToggleTheme={(theme) => { handleThemeChange(theme); }}
          onNewProject={() => { setPaletteOpen(false); goTo('projects'); }}
        />
      )}
      {showOnboarding && (
        <Onboarding
          lang={lang}
          onLangChange={handleUiLangChange}
          onClose={handleOnboardingClose}
          onPauseForSettings={() => {
            setShowOnboarding(false);
            setOnboardingPausedForSettings(true);
            goTo('settings');
          }}
          initialStep={(() => {
            return parseInt(safeGetItem('threadlog_onboarding_step') || '0', 10);
          })()}
        />
      )}
      {helpFeedbackOpen && (
        <FeedbackModal lang={lang} onClose={() => setHelpFeedbackOpen(false)} />
      )}
      {pendingNav && (
        <ConfirmDialog
          title={t('unsavedInputTitle', lang)}
          description={t('unsavedInputDesc', lang)}
          confirmLabel={t('unsavedInputConfirm', lang)}
          cancelLabel={t('cancel', lang)}
          danger={false}
          onConfirm={() => { const nav = pendingNav; setPendingNav(null); inputDirtyRef.current = false; nav(); }}
          onCancel={() => setPendingNav(null)}
        />
      )}
      {shortcutsOpen && (
        <div className="modal-overlay" onClick={() => setShortcutsOpen(false)}>
          <div ref={shortcutsTrapRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-label={t('shortcutsTitle', lang)} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('shortcutsTitle', lang)}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { keys: '⌘ N', desc: t('shortcutNewLog', lang) },
                { keys: '⌘ K', desc: t('shortcutSearch', lang) },
                { keys: '⌘ ,', desc: t('shortcutSettings', lang) },
                { keys: '⌘ Enter', desc: t('shortcutSubmit', lang) },
                { keys: '?', desc: t('shortcutShortcuts', lang) },
                { keys: 'Esc', desc: t('shortcutEscape', lang) },
              ]).map((s) => (
                <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-body)' }}>{s.desc}</span>
                  <kbd style={{
                    fontSize: 12, fontFamily: 'inherit', padding: '2px 8px',
                    borderRadius: 4, background: 'var(--bg-sidebar)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', minWidth: 32, textAlign: 'center',
                  }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button className="btn" onClick={() => setShortcutsOpen(false)} style={{ fontSize: 13 }}>
                {t('close', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
