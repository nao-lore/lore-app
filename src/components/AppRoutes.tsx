import React, { lazy, useMemo } from 'react';
import type { View } from '../hooks/useAppState';
import type { LogEntry, Project } from '../types';
import type { Lang } from '../i18n';
import type { ThemePref } from '../storage';
import type { FontSize } from '../types';
import ErrorBoundary from '../ErrorBoundary';
import Workspace from '../Workspace';

const HistoryView = lazy(() => import('../HistoryView'));
const SettingsPanel = lazy(() => import('../SettingsPanel'));
const MasterNoteView = lazy(() => import('../MasterNoteView'));
const ProjectsView = lazy(() => import('../ProjectsView'));
const TodoView = lazy(() => import('../TodoView'));
const TrashView = lazy(() => import('../TrashView'));
const ProjectSummaryListView = lazy(() => import('../ProjectSummaryListView'));
const ProjectHomeView = lazy(() => import('../ProjectHomeView'));
const TimelineView = lazy(() => import('../TimelineView'));
const DashboardView = lazy(() => import('../DashboardView'));
const HelpView = lazy(() => import('../HelpView'));
const WeeklyReportView = lazy(() => import('../WeeklyReportView'));
const KnowledgeBaseView = lazy(() => import('../KnowledgeBaseView'));
const PricingView = lazy(() => import('../PricingView'));

/** State bag needed by the route map builder */
export interface RouteMapDeps {
  view: View;
  prevView: View;
  lang: Lang;
  logs: LogEntry[];
  projects: Project[];
  todos: import('../types').Todo[];
  masterNotes: import('../types').MasterNote[];
  activeProjectId: string | null;
  selectedId: string | null;
  inputKey: number;
  themePref: ThemePref;
  fontSize: FontSize;
  tagFilter: string | null;
  pendingTodosCount: number;
  lastLogCreatedAt: string | null;
  // Callbacks
  goTo: (v: View) => void;
  goHome: () => void;
  handleSelect: (id: string) => void;
  handleGoToInput: () => void;
  handleGoToHistory: () => void;
  handleGoToTodos: () => void;
  handleGoToSummaryList: () => void;
  handleGoToDashboard: () => void;
  handleGoToWeeklyReport: () => void;
  handleOpenMasterNote: (projectId: string) => void;
  handleOpenProjectLogs: (projectId: string) => void;
  handleOpenKnowledgeBase: (projectId: string) => void;
  handleNewLog: () => void;
  handleSaved: (id: string) => void;
  handleDeleted: () => void;
  handleBack: () => void;
  handleDashboardToggleAction: (logId: string, idx: number) => void;
  handleThemeChange: (t: ThemePref) => void;
  handleFontSizeChange: (s: FontSize) => void;
  handleUiLangChange: (l: Lang) => void;
  handleTagFilter: (tag: string) => void;
  setShowOnboarding: (v: boolean) => void;
  setHelpFeedbackOpen: (v: boolean) => void;
  setActiveProjectId: (v: string | null) => void;
  setTagFilter: (v: string | null) => void;
  setInputDirty: (v: boolean) => void;
  refreshLogs: () => void;
  showToast: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export function useViewRouteMap(s: RouteMapDeps) {
  const backTo = (v: View) => () => s.goTo(s.prevView === v ? 'input' : s.prevView);
  const activeProject = useMemo(
    () => s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined,
    [s.activeProjectId, s.projects],
  );

  const viewRouteMap: Partial<Record<View, () => React.ReactElement | null>> = {
    settings: () => <SettingsPanel onBack={backTo('settings')} lang={s.lang} onUiLangChange={s.handleUiLangChange} themePref={s.themePref} onThemeChange={s.handleThemeChange} fontSize={s.fontSize} onFontSizeChange={s.handleFontSizeChange} showToast={s.showToast} onShowOnboarding={() => s.setShowOnboarding(true)} />,
    help: () => <HelpView onBack={backTo('help')} lang={s.lang} onShowOnboarding={() => s.setShowOnboarding(true)} onFeedback={() => s.setHelpFeedbackOpen(true)} />,
    pricing: () => <PricingView onBack={backTo('pricing')} lang={s.lang} showToast={s.showToast} />,
    history: () => <HistoryView logs={s.logs} onSelect={s.handleSelect} onBack={s.handleGoToInput} showBack={false} onRefresh={s.refreshLogs} lang={s.lang} activeProjectId={s.activeProjectId} projects={s.projects} showToast={s.showToast} onOpenMasterNote={s.handleOpenMasterNote} onOpenProject={s.handleOpenProjectLogs} tagFilter={s.tagFilter} onClearTagFilter={() => s.setTagFilter(null)} onTagFilter={s.setTagFilter} onDuplicate={(newId: string) => { s.refreshLogs(); s.handleSelect(newId); }} />,
    todos: () => <TodoView logs={s.logs} onBack={backTo('todos')} onOpenLog={s.handleSelect} lang={s.lang} showToast={s.showToast} />,
    dashboard: () => <DashboardView logs={s.logs} projects={s.projects} todos={s.todos} masterNotes={s.masterNotes} lang={s.lang} onOpenLog={s.handleSelect} onOpenProject={s.handleOpenProjectLogs} onOpenTodos={s.handleGoToTodos} onOpenSummaryList={s.handleGoToSummaryList} onOpenHistory={s.handleGoToHistory} onNewLog={s.handleGoToInput} onToggleAction={s.handleDashboardToggleAction} onOpenWeeklyReport={s.handleGoToWeeklyReport} onShowOnboarding={() => s.setShowOnboarding(true)} />,
    timeline: () => <TimelineView logs={s.logs} projects={s.projects} todos={s.todos} masterNotes={s.masterNotes} onBack={backTo('timeline')} onOpenLog={s.handleSelect} onOpenProject={s.handleOpenProjectLogs} onOpenSummary={s.handleOpenMasterNote} onNewLog={() => s.goTo('input')} lang={s.lang} />,
    weeklyreport: () => <WeeklyReportView logs={s.logs} projects={s.projects} todos={s.todos} onBack={backTo('weeklyreport')} onNewLog={s.handleGoToInput} lang={s.lang} showToast={s.showToast} />,
    trash: () => <TrashView onBack={backTo('trash')} onRefresh={s.refreshLogs} lang={s.lang} showToast={s.showToast} />,
    summarylist: () => <ProjectSummaryListView projects={s.projects} logs={s.logs} onBack={backTo('summarylist')} onOpenSummary={s.handleOpenMasterNote} lang={s.lang} />,
    projects: () => <ProjectsView projects={s.projects} logs={s.logs} onBack={backTo('projects')} onSelectProject={s.handleOpenProjectLogs} onOpenMasterNote={s.handleOpenMasterNote} onRefresh={s.refreshLogs} lang={s.lang} showToast={s.showToast} />,
    projecthome: () => {
      if (!activeProject) return null;
      return <ProjectHomeView project={activeProject} logs={s.logs} onBack={() => { s.setActiveProjectId(null); s.goTo('input'); }} onOpenLog={s.handleSelect} onOpenSummary={s.handleOpenMasterNote} onOpenKnowledgeBase={s.handleOpenKnowledgeBase} onNewLog={s.handleNewLog} onRefresh={s.refreshLogs} lang={s.lang} showToast={s.showToast} />;
    },
    masternote: () => {
      if (!activeProject) return null;
      const latestHandoff = s.logs.filter((l) => l.projectId === s.activeProjectId && l.outputMode === 'handoff').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || undefined;
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

  return { renderWorkspace };
}
