import { useState, useCallback, useRef, useMemo } from 'react';
import { useToast } from '../useToast';
import { useFocusTrap } from '../useFocusTrap';
import { loadLogs, loadProjects, loadTodos, loadMasterNotes, getUiLang, setUiLang, getTheme, setTheme as saveTheme, updateLog, getLog, safeGetItem, safeSetItem } from '../storage';
import type { ThemePref } from '../storage';
import type { FontSize } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';

export type View = 'input' | 'detail' | 'settings' | 'history' | 'masternote' | 'projects' | 'todos' | 'trash' | 'summarylist' | 'projecthome' | 'timeline' | 'help' | 'weeklyreport' | 'knowledgebase' | 'dashboard' | 'pricing';

const FONT_SIZE_KEY = 'threadlog_font_size';
const LAST_VIEW_KEY = 'threadlog_last_view';
const LAST_PROJECT_KEY = 'threadlog_last_project';
const SIDEBAR_KEY = 'threadlog_sidebar';

function resolveUiLang(): Lang {
  return getUiLang();
}

export function useAppState() {
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
  const goToRawRef = useRef<(next: View) => void>(null!);
  const goToRef = useRef<(next: View) => void>(null!);
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

  // Computed data
  const logs = useMemo(() => loadLogs(), [logsVersion]);
  const projects = useMemo(() => loadProjects(), [logsVersion]);
  const todos = useMemo(() => loadTodos(), [logsVersion]);
  const masterNotes = useMemo(() => loadMasterNotes(), [logsVersion]);
  const pendingTodosCount = useMemo(() => todos.filter((td) => !td.done && !td.archivedAt).length, [todos]);
  const lastLogCreatedAt = useMemo(() => logs.length > 0 ? logs[logs.length - 1].createdAt : null, [logs]);

  // Tab title pending count
  const pendingCount = useMemo(() => todos.filter((td) => !td.done).length, [todos]);

  // Overdue TODO
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdueTodos = useMemo(() => {
    return todos.filter((td) => !td.done && td.dueDate && td.dueDate < todayKey);
  }, [todos, todayKey]);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    safeGetItem('threadlog_overdue_dismissed') === todayKey
  );
  const showOverdueBanner = overdueTodos.length > 0 && !bannerDismissed;

  // Font size
  const handleFontSizeChange = (size: FontSize) => {
    setFontSizeState(size);
    safeSetItem(FONT_SIZE_KEY, size);
  };

  // Theme
  const handleThemeChange = (v: ThemePref) => {
    setThemePref(v);
    saveTheme(v);
  };

  // RefreshLogs
  const refreshLogs = useCallback(() => setLogsVersion((v) => v + 1), []);

  // Navigation core
  const goToRaw = useCallback((next: View) => {
    // Save current scroll position before navigating away
    if (scrollRef.current) {
      scrollPositionRef.current[view] = scrollRef.current.scrollTop;
    }
    setPrevView(view);
    setView(next);
    // Move focus to main content for screen readers / keyboard users
    requestAnimationFrame(() => scrollRef.current?.focus());
  }, [view]);

  // Navigation with dirty-input guard
  const goTo = useCallback((next: View) => {
    if (view === 'input' && inputDirtyRef.current && next !== 'input') {
      setPendingNav(() => () => goToRaw(next));
      return;
    }
    goToRaw(next);
  }, [view, goToRaw]);

  // Keep refs in sync so stable callbacks always see the latest version
  goToRawRef.current = goToRaw;
  goToRef.current = goTo;

  const handleSelect = useCallback((id: string) => {
    const doNav = () => { setSelectedId(id); goToRawRef.current('detail'); setPaletteOpen(false); };
    if (view === 'input' && inputDirtyRef.current) {
      setPendingNav(() => doNav);
      return;
    }
    doNav();
  }, [view]);

  const handleNewLog = useCallback(() => { setSelectedId(null); setInputKey((k) => k + 1); goToRawRef.current('input'); inputDirtyRef.current = false; }, []);
  const handleSaved = useCallback((id: string) => { setSelectedId(id); refreshLogs(); inputDirtyRef.current = false; }, [refreshLogs]);
  const handleDeleted = useCallback(() => { setSelectedId(null); setInputKey((k) => k + 1); goToRawRef.current('input'); refreshLogs(); showToast(t('deleted', lang), 'success'); inputDirtyRef.current = false; }, [refreshLogs, showToast, lang]);
  const handleBack = useCallback(() => { goToRef.current(prevView === 'detail' ? (activeProjectId ? 'projecthome' : 'history') : prevView); }, [prevView, activeProjectId]);

  // Lang
  const handleUiLangChange = (v: Lang) => {
    setUiLang(v);
    setLangState(v);
  };

  // Tag filter
  const handleTagFilter = (tag: string) => {
    setTagFilter(tag);
    setActiveProjectId(null);
    goToRawRef.current('history');
  };

  // Project navigation
  const handleOpenMasterNote = (projectId: string) => {
    setActiveProjectId(projectId);
    goToRef.current('masternote');
  };

  const handleOpenKnowledgeBase = (projectId: string) => {
    setActiveProjectId(projectId);
    goToRef.current('knowledgebase');
  };

  const handleOpenProjectLogs = (projectId: string) => {
    setActiveProjectId(projectId);
    goToRef.current('projecthome');
    setPaletteOpen(false);
  };

  const handlePaletteSelectProject = (projectId: string) => {
    handleOpenProjectLogs(projectId);
  };

  const goHome = useCallback(() => { setSelectedId(null); setInputKey((k) => k + 1); inputDirtyRef.current = false; goToRawRef.current('input'); }, []);

  // Onboarding
  const handleOnboardingClose = useCallback(async () => {
    const isFirstLaunch = safeGetItem('threadlog_sample_seeded') !== '1';
    if (isFirstLaunch) {
      const { seedSampleData } = await import('../sampleData');
      seedSampleData(lang);
      setLogsVersion((v) => v + 1);
    }
    setShowOnboarding(false);
    if (isFirstLaunch) {
      goToRawRef.current('dashboard');
    }
  }, [lang]);

  // Stable callbacks for memo'd child components
  const handleGoToSettings = useCallback(() => goToRef.current('settings' as View), []);
  const handleGoToHistory = useCallback(() => { setActiveProjectId(null); setView('history'); }, []);
  const handleGoToProjects = useCallback(() => goToRef.current('projects'), []);
  const handleGoToTodos = useCallback(() => goToRef.current('todos'), []);
  const handleGoToSummaryList = useCallback(() => goToRef.current('summarylist'), []);
  const handleGoToDashboard = useCallback(() => goToRef.current('dashboard'), []);
  const handleGoToTimeline = useCallback(() => goToRef.current('timeline'), []);
  const handleGoToWeeklyReport = useCallback(() => goToRef.current('weeklyreport'), []);
  const handleGoToTrash = useCallback(() => goToRef.current('trash'), []);
  const handleGoToHelp = useCallback(() => goToRef.current('help'), []);
  const handleGoToPricing = useCallback(() => goToRef.current('pricing'), []);
  const handleGoToInput = useCallback(() => goToRef.current('input'), []);
  const handleCollapseSidebar = useCallback(() => { setSidebarOpen(false); safeSetItem(SIDEBAR_KEY, 'collapsed'); }, []);
  const handleHideSidebar = useCallback(() => { setSidebarOpen(false); setSidebarHidden(true); safeSetItem(SIDEBAR_KEY, 'hidden'); }, []);
  const handleBottomNav = useCallback((v: View) => {
    if (v === 'input') { handleNewLog(); }
    else if (v === 'settings') { goToRef.current('settings'); }
    else { goToRef.current(v); }
  }, [handleNewLog]);
  const handleDashboardToggleAction = useCallback((logId: string, actionIndex: number) => {
    const log = getLog(logId);
    if (!log) return;
    const current = log.checkedActions || [];
    const next = current.includes(actionIndex) ? current.filter((i: number) => i !== actionIndex) : [...current, actionIndex];
    updateLog(logId, { checkedActions: next });
    refreshLogs();
  }, [refreshLogs]);

  return {
    // View state
    view, setView, prevView, setPrevView,
    selectedId, setSelectedId,
    sidebarOpen, setSidebarOpen,
    sidebarHidden, setSidebarHidden,
    logsVersion, setLogsVersion,
    inputKey, setInputKey,
    lang, setLangState,
    themePref, setThemePref,
    activeProjectId, setActiveProjectId,
    fontSize, setFontSizeState,
    paletteOpen, setPaletteOpen,
    toast, showToast,
    inputDirtyRef,
    pendingNav, setPendingNav,
    scrollRef, scrollPositionRef,
    showOnboarding, setShowOnboarding,
    onboardingPausedForSettings, setOnboardingPausedForSettings,
    helpFeedbackOpen, setHelpFeedbackOpen,
    tagFilter, setTagFilter,
    shortcutsOpen, setShortcutsOpen,
    shortcutsTrapRef,
    showReportReminder, setShowReportReminder,
    offlineStatus, setOfflineStatus, offlineDismissed, setOfflineDismissed,
    showScrollTop, setShowScrollTop,

    // Computed data
    logs, projects, todos, masterNotes,
    pendingTodosCount, lastLogCreatedAt,
    pendingCount,
    todayKey, overdueTodos,
    bannerDismissed, setBannerDismissed,
    showOverdueBanner,

    // Handlers
    handleFontSizeChange,
    handleThemeChange,
    refreshLogs,
    goToRaw, goTo,
    handleSelect, handleNewLog, handleSaved, handleDeleted, handleBack,
    handleUiLangChange,
    handleTagFilter,
    handleOpenMasterNote, handleOpenKnowledgeBase, handleOpenProjectLogs,
    handlePaletteSelectProject,
    goHome,
    handleOnboardingClose,
    handleGoToSettings, handleGoToHistory, handleGoToProjects, handleGoToTodos,
    handleGoToSummaryList, handleGoToDashboard, handleGoToTimeline,
    handleGoToWeeklyReport, handleGoToTrash, handleGoToHelp, handleGoToPricing,
    handleGoToInput,
    handleCollapseSidebar, handleHideSidebar,
    handleBottomNav,
    handleDashboardToggleAction,

    // Constants needed by effects
    SIDEBAR_KEY,
    LAST_VIEW_KEY,
    LAST_PROJECT_KEY,
    FONT_SIZE_KEY,
  };
}
