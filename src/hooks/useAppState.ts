import { useState, useCallback } from 'react';
import { useToast } from '../useToast';
import { useFocusTrap } from '../useFocusTrap';
import { getUiLang, setUiLang, getTheme, setTheme as saveTheme, updateLog, getLog, safeGetItem, safeSetItem } from '../storage';
import type { ThemePref } from '../storage';
import type { FontSize } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { useNavigation } from './useNavigation';
import type { View } from './useNavigation';
import { useDataStore } from './useDataStore';
import { useSidebarState } from './useSidebarState';

export type { View };

const FONT_SIZE_KEY = 'threadlog_font_size';
const LAST_PROJECT_KEY = 'threadlog_last_project';

function resolveUiLang(): Lang {
  return getUiLang();
}

/**
 * useAppState — intentionally large aggregator hook.
 *
 * This hook composes several domain hooks (useNavigation, useDataStore,
 * useSidebarState) and adds cross-cutting app-level state (lang, theme,
 * project, palette, onboarding, etc.). The 50+ returned properties are
 * expected because this is the single composition point consumed by App.tsx.
 * Do NOT split this further — it is the glue layer, not business logic.
 */
export function useAppState() {
  // ── Domain hooks ──────────────────────────────────────────────
  const nav = useNavigation();
  const data = useDataStore();
  const sidebar = useSidebarState();

  // ── Remaining app-level state ─────────────────────────────────
  const [lang, setLangState] = useState<Lang>(resolveUiLang);
  const [themePref, setThemePref] = useState<ThemePref>(getTheme);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => safeGetItem(LAST_PROJECT_KEY) || null);
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = safeGetItem(FONT_SIZE_KEY);
    if (saved === 'small' || saved === 'medium' || saved === 'large') return saved;
    return 'medium';
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { toast, toasts, showToast } = useToast();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [helpFeedbackOpen, setHelpFeedbackOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsTrapRef = useFocusTrap<HTMLDivElement>(shortcutsOpen);
  const [showReportReminder, setShowReportReminder] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<'online' | 'offline' | 'back-online'>(() =>
    navigator.onLine ? 'online' : 'offline'
  );
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Overdue banner
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    safeGetItem('threadlog_overdue_dismissed') === data.todayKey
  );
  const showOverdueBanner = data.overdueTodos.length > 0 && !bannerDismissed;

  // ── Handlers (font size / theme / lang) ───────────────────────
  const handleFontSizeChange = useCallback((size: FontSize) => {
    setFontSizeState(size);
    safeSetItem(FONT_SIZE_KEY, size);
  }, []);

  const handleThemeChange = useCallback((v: ThemePref) => {
    setThemePref(v);
    saveTheme(v);
  }, []);

  const handleUiLangChange = useCallback((v: Lang) => {
    setUiLang(v);
    setLangState(v);
  }, []);

  // ── Cross-domain handlers (bridge nav + data + local state) ───

  // Wrap nav.handleSelect to also close palette
  const handleSelect = useCallback((id: string) => {
    nav.handleSelect(id);
    setPaletteOpen(false);
  }, [nav]);

  const handleNewLog = useCallback(() => {
    nav.handleNewLog();
  }, [nav]);

  const handleSaved = useCallback((id: string) => {
    nav.setSelectedId(id);
    data.refreshLogs();
    nav.inputDirtyRef.current = false;
  }, [data, nav]);

  const handleDeleted = useCallback(() => {
    nav.setSelectedId(null);
    nav.setInputKey((k) => k + 1);
    nav.goToRawRef.current('input');
    data.refreshLogs();
    showToast(t('deleted', lang), 'success');
    nav.inputDirtyRef.current = false;
  }, [data, nav, showToast, lang]);

  // Wrap nav.handleBack to pass activeProjectId
  const handleBack = useCallback(() => {
    nav.handleBack(activeProjectId);
  }, [nav, activeProjectId]);

  const goHome = useCallback(() => {
    nav.goHome();
  }, [nav]);

  const handleTagFilter = useCallback((tag: string) => {
    setTagFilter(tag);
    setActiveProjectId(null);
    nav.goToRawRef.current('history');
  }, [nav]);

  const handleOpenMasterNote = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    nav.goToRef.current('masternote');
  }, [nav]);

  const handleOpenKnowledgeBase = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    nav.goToRef.current('knowledgebase');
  }, [nav]);

  const handleOpenProjectLogs = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    nav.goToRef.current('projecthome');
    setPaletteOpen(false);
  }, [nav]);

  const handlePaletteSelectProject = useCallback((projectId: string) => {
    handleOpenProjectLogs(projectId);
  }, [handleOpenProjectLogs]);

  // ── Onboarding ────────────────────────────────────────────────
  const handleOnboardingClose = useCallback(async () => {
    const isFirstLaunch = safeGetItem('threadlog_sample_seeded') !== '1';
    if (isFirstLaunch) {
      const { seedSampleData } = await import('../sampleData');
      seedSampleData(lang);
      data.setLogsVersion((v) => v + 1);
    }
    setShowOnboarding(false);
    if (isFirstLaunch) {
      nav.goToRawRef.current('dashboard');
    }
  }, [lang, data, nav]);

  // ── Stable "go-to" callbacks for memo'd child components ──────
  const handleGoToSettings = useCallback(() => nav.goToRef.current('settings'), [nav]);
  const handleGoToHistory = useCallback(() => { setActiveProjectId(null); nav.setView('history'); }, [nav]);
  const handleGoToProjects = useCallback(() => nav.goToRef.current('projects'), [nav]);
  const handleGoToTodos = useCallback(() => nav.goToRef.current('todos'), [nav]);
  const handleGoToSummaryList = useCallback(() => nav.goToRef.current('summarylist'), [nav]);
  const handleGoToDashboard = useCallback(() => nav.goToRef.current('dashboard'), [nav]);
  const handleGoToTimeline = useCallback(() => nav.goToRef.current('timeline'), [nav]);
  const handleGoToWeeklyReport = useCallback(() => nav.goToRef.current('weeklyreport'), [nav]);
  const handleGoToTrash = useCallback(() => nav.goToRef.current('trash'), [nav]);
  const handleGoToHelp = useCallback(() => nav.goToRef.current('help'), [nav]);
  const handleGoToPricing = useCallback(() => nav.goToRef.current('pricing'), [nav]);
  const handleGoToInput = useCallback(() => nav.goToRef.current('input'), [nav]);
  const handleCollapseSidebar = sidebar.handleCollapseSidebar;
  const handleHideSidebar = sidebar.handleHideSidebar;

  const handleBottomNav = useCallback((v: View) => {
    if (v === 'input') { handleNewLog(); }
    else if (v === 'settings') { nav.goToRef.current('settings'); }
    else { nav.goToRef.current(v); }
  }, [handleNewLog, nav]);

  const handleDashboardToggleAction = useCallback((logId: string, actionIndex: number) => {
    const log = getLog(logId);
    if (!log) return;
    const current = log.checkedActions || [];
    const next = current.includes(actionIndex) ? current.filter((i: number) => i !== actionIndex) : [...current, actionIndex];
    updateLog(logId, { checkedActions: next });
    data.refreshLogs();
  }, [data]);

  return {
    // View state (from useNavigation)
    view: nav.view, setView: nav.setView, prevView: nav.prevView, setPrevView: nav.setPrevView,
    selectedId: nav.selectedId, setSelectedId: nav.setSelectedId,
    inputKey: nav.inputKey, setInputKey: nav.setInputKey,
    scrollRef: nav.scrollRef, scrollPositionRef: nav.scrollPositionRef,
    inputDirtyRef: nav.inputDirtyRef,
    pendingNav: nav.pendingNav, setPendingNav: nav.setPendingNav,
    goToRaw: nav.goToRaw, goTo: nav.goTo,
    goToRawRef: nav.goToRawRef, goToRef: nav.goToRef,
    navDirection: nav.navDirection,
    clearInputDirty: nav.clearInputDirty, setInputDirty: nav.setInputDirty,

    // Sidebar (from useSidebarState)
    sidebarOpen: sidebar.sidebarOpen, setSidebarOpen: sidebar.setSidebarOpen,
    sidebarHidden: sidebar.sidebarHidden, setSidebarHidden: sidebar.setSidebarHidden,

    // Data (from useDataStore)
    logsVersion: data.logsVersion, setLogsVersion: data.setLogsVersion,
    logs: data.logs, projects: data.projects, todos: data.todos, masterNotes: data.masterNotes,
    pendingTodosCount: data.pendingTodosCount, lastLogCreatedAt: data.lastLogCreatedAt,
    pendingCount: data.pendingCount,
    todayKey: data.todayKey, overdueTodos: data.overdueTodos,
    refreshLogs: data.refreshLogs,

    // App-level state
    lang, setLangState,
    themePref, setThemePref,
    activeProjectId, setActiveProjectId,
    fontSize, setFontSizeState,
    paletteOpen, setPaletteOpen,
    toast, toasts, showToast,
    showOnboarding, setShowOnboarding,
    helpFeedbackOpen, setHelpFeedbackOpen,
    tagFilter, setTagFilter,
    shortcutsOpen, setShortcutsOpen,
    shortcutsTrapRef,
    showReportReminder, setShowReportReminder,
    offlineStatus, setOfflineStatus, offlineDismissed, setOfflineDismissed,
    showScrollTop, setShowScrollTop,
    bannerDismissed, setBannerDismissed,
    showOverdueBanner,

    // Handlers
    handleFontSizeChange,
    handleThemeChange,
    handleUiLangChange,
    handleSelect, handleNewLog, handleSaved, handleDeleted, handleBack,
    goHome,
    handleTagFilter,
    handleOpenMasterNote, handleOpenKnowledgeBase, handleOpenProjectLogs,
    handlePaletteSelectProject,
    handleOnboardingClose,
    handleGoToSettings, handleGoToHistory, handleGoToProjects, handleGoToTodos,
    handleGoToSummaryList, handleGoToDashboard, handleGoToTimeline,
    handleGoToWeeklyReport, handleGoToTrash, handleGoToHelp, handleGoToPricing,
    handleGoToInput,
    handleCollapseSidebar, handleHideSidebar,
    handleBottomNav,
    handleDashboardToggleAction,

    // Constants needed by effects
    SIDEBAR_KEY: sidebar.SIDEBAR_KEY,
    LAST_VIEW_KEY: nav.LAST_VIEW_KEY,
    LAST_PROJECT_KEY,
    FONT_SIZE_KEY,
  };
}
