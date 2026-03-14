import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import CommandPalette from './CommandPalette';
import BottomNav from './BottomNav';
import { Toast } from './Toast';
import { useToast } from './useToast';
import ConfirmDialog from './ConfirmDialog';
import Onboarding from './Onboarding';
import ErrorBoundary from './ErrorBoundary';
import { isOnboardingDone } from './onboardingState';
import { seedSampleData, isSampleSeeded } from './sampleData';

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
import { loadLogs, loadProjects, loadTodos, loadMasterNotes, getUiLang, setUiLang, getTheme, setTheme as saveTheme, purgeExpiredTrash, updateLog, getLog, getAutoReportSetting, getLastReportDate, setLastReportDate, isDemoMode, setDemoMode } from './storage';
import type { ThemePref } from './storage';
import type { FontSize } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';

const FONT_SIZE_KEY = 'threadlog_font_size';
const LAST_VIEW_KEY = 'threadlog_last_view';
const LAST_PROJECT_KEY = 'threadlog_last_project';
const SIDEBAR_KEY = 'threadlog_sidebar';

const FONT_SIZE_SCALE: Record<FontSize, number> = { small: 0.87, medium: 1, large: 1.13 };

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { console.error(`Failed to read localStorage key: ${key}`); return null; }
}
function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { console.error(`Failed to write localStorage key: ${key}`); }
}
function safeRemoveItem(key: string): void {
  try { localStorage.removeItem(key); } catch { console.error(`Failed to remove localStorage key: ${key}`); }
}

type View = 'input' | 'detail' | 'settings' | 'history' | 'masternote' | 'projects' | 'todos' | 'trash' | 'summarylist' | 'projecthome' | 'timeline' | 'help' | 'weeklyreport' | 'knowledgebase' | 'dashboard';

function resolveUiLang(): Lang {
  return getUiLang();
}

function resolveEffectiveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  // Time-based: 7:00–19:00 local time = light, otherwise dark
  const hour = new Date().getHours();
  return (hour >= 7 && hour < 19) ? 'light' : 'dark';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<Record<string, number>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showReportReminder, setShowReportReminder] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<'online' | 'offline' | 'back'>(() =>
    navigator.onLine ? 'online' : 'offline'
  );

  // Offline / online detection
  useEffect(() => {
    const handleOffline = () => setOfflineStatus('offline');
    const handleOnline = () => {
      setOfflineStatus('back');
      const timer = setTimeout(() => setOfflineStatus('online'), 3000);
      return () => clearTimeout(timer);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const logs = loadLogs();
  const projects = loadProjects();
  const todos = loadTodos();
  const masterNotes = loadMasterNotes();
  void logsVersion;

  // Tab title: show pending TODO count
  const pendingCount = useMemo(() => todos.filter((td) => !td.done).length, [todos]);
  useEffect(() => {
    document.title = pendingCount > 0 ? `Lore (${pendingCount})` : 'Lore';
  }, [pendingCount]);

  // Overdue TODO banner
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdueTodos = useMemo(() => {
    return todos.filter((td) => !td.done && td.dueDate && td.dueDate < todayKey);
  }, [todos, todayKey]);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    sessionStorage.getItem('threadlog_overdue_dismissed') === todayKey
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
      }
    };
    // Check on mount (in case app loaded with hash already set)
    handleExtensionImport();
    window.addEventListener('hashchange', handleExtensionImport);
    return () => window.removeEventListener('hashchange', handleExtensionImport);
  }, []);

  // Show onboarding on first launch (0 logs + flag not set)
  useEffect(() => {
    if (logs.length === 0 && !isOnboardingDone()) {
      setShowOnboarding(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  const handleOnboardingClose = useCallback(() => {
    if (!isSampleSeeded()) {
      seedSampleData(lang);
      setLogsVersion((v) => v + 1);
    }
    setShowOnboarding(false);
  }, [lang]);

  // Apply data-theme attribute; re-check hourly for time-based "system" mode
  useEffect(() => {
    const apply = () => {
      const effective = resolveEffectiveTheme(themePref);
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply();

    if (themePref === 'system') {
      // Re-evaluate every 60 min to catch day/night transitions
      const timer = setInterval(apply, 60 * 60 * 1000);
      return () => clearInterval(timer);
    }
  }, [themePref]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  const goToRaw = (next: View) => {
    // Save current scroll position before navigating away
    if (scrollRef.current) {
      scrollPositionRef.current[view] = scrollRef.current.scrollTop;
    }
    setPrevView(view);
    setView(next);
  };

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
  const goTo = (next: View) => {
    if (view === 'input' && inputDirtyRef.current && next !== 'input') {
      setPendingNav(() => () => goToRaw(next));
      return;
    }
    goToRaw(next);
  };

  const handleSelect = (id: string) => {
    const doNav = () => { setSelectedId(id); goToRaw('detail'); setPaletteOpen(false); };
    if (view === 'input' && inputDirtyRef.current) {
      setPendingNav(() => doNav);
      return;
    }
    doNav();
  };
  const handleNewLog = () => { setSelectedId(null); setInputKey((k) => k + 1); goToRaw('input'); inputDirtyRef.current = false; };
  const handleSaved = (id: string) => { setSelectedId(id); refreshLogs(); inputDirtyRef.current = false; };
  const handleDeleted = () => { setSelectedId(null); setInputKey((k) => k + 1); goToRaw('input'); refreshLogs(); showToast(t('deleted', lang), 'success'); inputDirtyRef.current = false; };
  const handleBack = () => { goTo(prevView === 'detail' ? (activeProjectId ? 'projecthome' : 'history') : prevView); };

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

  const renderWorkspace = () => {
    if (view === 'settings') return <SettingsPanel onBack={() => goTo(prevView === 'settings' ? 'input' : prevView)} lang={lang} onUiLangChange={handleUiLangChange} themePref={themePref} onThemeChange={handleThemeChange} fontSize={fontSize} onFontSizeChange={handleFontSizeChange} showToast={showToast} onShowOnboarding={() => setShowOnboarding(true)} />;
    if (view === 'help') return <HelpView onBack={() => goTo(prevView === 'help' ? 'input' : prevView)} lang={lang} onShowOnboarding={() => setShowOnboarding(true)} />;
    if (view === 'history') return <HistoryView logs={logs} onSelect={handleSelect} onBack={() => goTo('input')} onRefresh={refreshLogs} lang={lang} activeProjectId={activeProjectId} projects={projects} showToast={showToast} onOpenMasterNote={handleOpenMasterNote} onOpenProject={handleOpenProjectLogs} tagFilter={tagFilter} onClearTagFilter={() => setTagFilter(null)} onTagFilter={setTagFilter} onDuplicate={(newId) => { refreshLogs(); handleSelect(newId); }} />;
    if (view === 'todos') return <TodoView logs={logs} onBack={() => goTo(prevView === 'todos' ? 'input' : prevView)} onOpenLog={handleSelect} lang={lang} showToast={showToast} />;
    if (view === 'dashboard') return <DashboardView logs={logs} projects={projects} todos={todos} masterNotes={masterNotes} lang={lang} onOpenLog={handleSelect} onOpenProject={handleOpenProjectLogs} onOpenTodos={() => goTo('todos')} onOpenSummaryList={() => goTo('summarylist')} onOpenHistory={() => goTo('history')} onNewLog={() => goTo('input')} onToggleAction={(logId, actionIndex) => {
      const log = getLog(logId);
      if (!log) return;
      const current = log.checkedActions || [];
      const next = current.includes(actionIndex) ? current.filter((i) => i !== actionIndex) : [...current, actionIndex];
      updateLog(logId, { checkedActions: next });
      refreshLogs();
    }} />;
    if (view === 'timeline') return <TimelineView logs={logs} projects={projects} todos={todos} masterNotes={masterNotes} onBack={() => goTo(prevView === 'timeline' ? 'input' : prevView)} onOpenLog={handleSelect} onOpenProject={handleOpenProjectLogs} onOpenSummary={handleOpenMasterNote} onNewLog={() => goTo('input')} lang={lang} />;
    if (view === 'weeklyreport') return <WeeklyReportView logs={logs} projects={projects} todos={todos} onBack={() => goTo(prevView === 'weeklyreport' ? 'input' : prevView)} lang={lang} showToast={showToast} />;
    if (view === 'trash') return <TrashView onBack={() => goTo(prevView === 'trash' ? 'input' : prevView)} onRefresh={refreshLogs} lang={lang} showToast={showToast} />;
    if (view === 'summarylist') return <ProjectSummaryListView projects={projects} logs={logs} onBack={() => goTo(prevView === 'summarylist' ? 'input' : prevView)} onOpenSummary={handleOpenMasterNote} lang={lang} />;
    if (view === 'projects') return <ProjectsView projects={projects} logs={logs} onBack={() => goTo(prevView === 'projects' ? 'input' : prevView)} onSelectProject={handleOpenProjectLogs} onOpenMasterNote={handleOpenMasterNote} onRefresh={refreshLogs} lang={lang} showToast={showToast} />;
    if (view === 'projecthome' && activeProjectId) {
      const project = projects.find((p) => p.id === activeProjectId);
      if (project) return <ProjectHomeView project={project} logs={logs} onBack={() => { setActiveProjectId(null); goTo('input'); }} onOpenLog={handleSelect} onOpenSummary={handleOpenMasterNote} onOpenKnowledgeBase={handleOpenKnowledgeBase} onNewLog={handleNewLog} onRefresh={refreshLogs} lang={lang} showToast={showToast} />;
    }
    if (view === 'masternote' && activeProjectId) {
      const project = projects.find((p) => p.id === activeProjectId);
      if (project) {
        const latestHandoff = logs
          .filter((l) => l.projectId === activeProjectId && l.outputMode === 'handoff')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || undefined;
        return <MasterNoteView project={project} logs={logs} latestHandoff={latestHandoff} onBack={() => goTo(prevView === 'masternote' ? 'input' : prevView)} onOpenLog={handleSelect} lang={lang} showToast={showToast} />;
      }
    }
    if (view === 'knowledgebase' && activeProjectId) {
      const project = projects.find((p) => p.id === activeProjectId);
      if (project) return <KnowledgeBaseView project={project} logs={logs} onBack={() => goTo(prevView === 'knowledgebase' ? 'input' : prevView)} onOpenLog={handleSelect} lang={lang} showToast={showToast} />;
    }
    // Fallback: 'input', 'detail', and any view that couldn't render (e.g. projecthome without activeProjectId)
    return <Workspace key={inputKey} mode={view === 'detail' ? 'detail' : 'input'} selectedId={selectedId} onSaved={handleSaved} onDeleted={handleDeleted} onOpenLog={handleSelect} onBack={handleBack} prevView={prevView} lang={lang} activeProjectId={activeProjectId} projects={projects} onRefresh={refreshLogs} showToast={showToast} onDirtyChange={(dirty: boolean) => { inputDirtyRef.current = dirty; }} onTagFilter={handleTagFilter} onOpenMasterNote={handleOpenMasterNote} onSelectProject={setActiveProjectId} />;
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {!sidebarOpen && (
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
        />
      )}
      {!sidebarOpen && !sidebarHidden && (
        <div style={{ width: 52, minWidth: 52, height: '100%', borderRight: '1px solid var(--border-default)', background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
          <button className="toggle-btn" onClick={() => { setSidebarOpen(true); safeSetItem(SIDEBAR_KEY, 'open'); }} title={t('showSidebar', lang)} aria-label={t('ariaShowSidebar', lang)}>◫</button>
        </div>
      )}
      {sidebarOpen && (
        <Sidebar
          logs={logs} projects={projects} todos={todos} selectedId={selectedId}
          activeProjectId={activeProjectId}
          activeView={view}
          onSelect={handleSelect} onNewLog={handleNewLog}
          onOpenSettings={() => setView('settings')}
          onOpenHistory={() => { setActiveProjectId(null); setView('history'); }}
          onOpenProjects={() => goTo('projects')}
          onOpenTodos={() => goTo('todos')}
          onOpenProjectSummaryList={() => goTo('summarylist')}
          onOpenDashboard={() => goTo('dashboard')}
          onOpenTimeline={() => goTo('timeline')}
          onOpenWeeklyReport={() => goTo('weeklyreport')}
          onOpenTrash={() => goTo('trash')}
          onOpenHelp={() => goTo('help')}
          onCollapse={() => { setSidebarOpen(false); safeSetItem(SIDEBAR_KEY, 'collapsed'); }}
          onHide={() => { setSidebarOpen(false); setSidebarHidden(true); safeSetItem(SIDEBAR_KEY, 'hidden'); }}
          onSelectProject={handleOpenProjectLogs}
          onOpenMasterNote={handleOpenMasterNote}
          onRefresh={refreshLogs}
          onDeleted={handleDeleted}
          lang={lang}
          showToast={showToast}
        />
      )}
      <div ref={scrollRef} data-main-scroll style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: 'var(--bg-app)' }}>
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
          <ErrorBoundary>
            <Suspense fallback={null}>
              <div className="view-fade-in" key={view}>
                {renderWorkspace()}
              </div>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      {showOverdueBanner && (
        <div className="overdue-banner">
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
              sessionStorage.setItem('threadlog_overdue_dismissed', todayKey);
            }}
          >
            ×
          </button>
        </div>
      )}
      {showReportReminder && (
        <div className="overdue-banner">
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
          >
            ×
          </button>
        </div>
      )}
      <BottomNav
        activeView={view}
        onNavigate={(v) => {
          if (v === 'input') { handleNewLog(); }
          else if (v === 'settings') { goTo('settings' as View); }
          else { goTo(v as View); }
        }}
        lang={lang}
      />
      {offlineStatus !== 'online' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: offlineStatus === 'offline' ? 'var(--warning-bg, #f59e0b)' : 'var(--success-bg, #22c55e)',
          color: offlineStatus === 'offline' ? 'var(--warning-text, #78350f)' : 'var(--success-text, #052e16)',
          textAlign: 'center', fontSize: 12, padding: '4px 0',
          transition: 'opacity 0.3s',
        }}>
          {offlineStatus === 'offline' ? t('offline', lang) : t('backOnline', lang)}
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
        />
      )}
      {showOnboarding && (
        <Onboarding
          lang={lang}
          onLangChange={handleUiLangChange}
          onClose={handleOnboardingClose}
        />
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
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('shortcutsTitle', lang)}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { keys: '⌘ N', desc: t('shortcutNewLog', lang) },
                { keys: '⌘ K', desc: t('shortcutSearch', lang) },
                { keys: '⌘ ,', desc: t('shortcutSettings', lang) },
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
