import { useMemo, useState, memo } from 'react';
import { Square, CheckSquare, AlertTriangle, ChevronDown, ChevronRight, Plus, PlayCircle, FileText, HelpCircle } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getGreeting } from './greeting';
import FirstUseTooltip from './FirstUseTooltip';
import { EmptyDashboard } from './EmptyIllustrations';
import ActivitySummaryCard from './components/ActivitySummaryCard';
import TrendsSection from './components/TrendsSection';
import NudgeCards from './components/NudgeCards';

interface DashboardViewProps {
  logs: LogEntry[];
  projects: Project[];
  todos: Todo[];
  masterNotes: MasterNote[];
  lang: Lang;
  onOpenLog: (id: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenTodos: () => void;
  onOpenSummaryList: () => void;
  onOpenHistory: () => void;
  onNewLog: () => void;
  onToggleAction: (logId: string, actionIndex: number) => void;
  onOpenWeeklyReport?: () => void;
  onShowOnboarding?: () => void;
}

interface PendingAction {
  text: string;
  logId: string;
  logTitle: string;
  projectName?: string;
  projectId?: string;
  checked: boolean;
  index: number;
  createdAt: string;
}

interface ProjectSnapshot {
  project: Project;
  latestHandoff: LogEntry;
  pendingCount: number;
  totalCount: number;
  blockers: string[];
}

function DashboardView({ logs, projects, todos, masterNotes, lang, onOpenProject, onOpenTodos, onOpenSummaryList, onOpenHistory, onNewLog, onToggleAction, onOpenWeeklyReport, onShowOnboarding }: DashboardViewProps) {
  const [moreTasksOpen, setMoreTasksOpen] = useState(false);

  const handoffLogs = useMemo(() =>
    logs.filter((l) => l.outputMode === 'handoff').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [logs]
  );

  const pendingActions = useMemo(() => {
    const actions: PendingAction[] = [];
    const seen = new Set<string>();
    for (const log of handoffLogs) {
      if (!log.nextActions?.length) continue;
      const proj = projects.find((p) => p.id === log.projectId);
      for (let i = 0; i < log.nextActions.length; i++) {
        const text = log.nextActions[i];
        const key = text.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        const checked = log.checkedActions?.includes(i) || false;
        actions.push({ text, logId: log.id, logTitle: log.title, projectName: proj?.name, projectId: log.projectId || undefined, checked, index: i, createdAt: log.createdAt });
      }
    }
    return actions;
  }, [handoffLogs, projects]);

  const uncheckedActions = pendingActions.filter((a) => !a.checked);
  const recentlyDone = pendingActions.filter((a) => a.checked).slice(0, 3);
  const checkedCount = pendingActions.filter((a) => a.checked).length;
  const totalActions = pendingActions.length;

  const lastActiveProject = useMemo(() => {
    if (handoffLogs.length === 0) return null;
    const latest = handoffLogs[0];
    if (!latest.projectId) return null;
    return projects.find((p) => p.id === latest.projectId) || null;
  }, [handoffLogs, projects]);

  const projectSnapshots = useMemo(() => {
    const snaps: ProjectSnapshot[] = [];
    for (const project of projects) {
      const projectHandoffs = handoffLogs.filter((l) => l.projectId === project.id);
      if (projectHandoffs.length === 0) continue;
      const latest = projectHandoffs[0];
      const totalCount = latest.nextActions?.length || 0;
      const pendingCount = totalCount - (latest.checkedActions?.length || 0);
      const blockers = latest.blockers || [];
      snaps.push({ project, latestHandoff: latest, pendingCount, totalCount, blockers });
    }
    return snaps.sort((a, b) => new Date(b.latestHandoff.createdAt).getTime() - new Date(a.latestHandoff.createdAt).getTime());
  }, [projects, handoffLogs]);

  const focusTasks = uncheckedActions.slice(0, 5);

  // ── Empty state ──
  if (handoffLogs.length === 0) {
    return (
      <div className="workspace-content-wide flex-col items-center">
        <div className="text-center font-extrabold" style={{ fontSize: 28, color: 'var(--text-secondary)', marginTop: 80, marginBottom: 16 }}>
          {getGreeting(lang)}
        </div>
        <div className="empty-state">
          <div className="empty-state-icon"><EmptyDashboard lang={lang} /></div>
          <p className="font-semibold" style={{ fontSize: 20 }}>
            {t('dashboardEmptyTitle', lang)}
          </p>
          <p className="page-subtitle" style={{ maxWidth: 360, margin: '8px auto 0' }}>
            {t('dashboardEmptyDesc', lang)}
          </p>
          <div className="dashboard-steps">
            <div className="dashboard-step">
              <span className="dashboard-step-num">1</span>
              <span className="dashboard-step-text">{t('dashboardStep1', lang)}</span>
            </div>
            <div className="dashboard-step">
              <span className="dashboard-step-num">2</span>
              <span className="dashboard-step-text">{t('dashboardStep2', lang)}</span>
            </div>
            <div className="dashboard-step">
              <span className="dashboard-step-num">3</span>
              <span className="dashboard-step-text">{t('dashboardStep3', lang)}</span>
            </div>
          </div>
          <FirstUseTooltip id="dashboard" text={lang === 'ja' ? 'AIプロジェクトのスナップショットがここに表示されます' : 'Your AI project snapshots appear here'} position="top" lang={lang}>
            <button className="btn btn-primary mt-lg" onClick={onNewLog} style={{ fontSize: 16, padding: '12px 28px' }}>
              <Plus size={18} />
              {t('dashboardCreateFirstSnapshot', lang)}
            </button>
          </FirstUseTooltip>

          {/* Sample preview — show what populated dashboard looks like */}
          <div className="dashboard-sample-preview">
            <p className="font-semibold text-sm" style={{ color: 'var(--text-placeholder)', marginBottom: 12 }}>
              {t('dashboardSamplePreviewTitle', lang)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 360 }}>
              {/* Sample project card */}
              <div style={{
                padding: '12px 16px', borderRadius: 10,
                background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                opacity: 0.6, pointerEvents: 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>📂</span>
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {t('dashboardSampleProject', lang)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border-subtle)' }}>
                    <div style={{ width: '33%', height: '100%', borderRadius: 2, background: 'var(--accent)' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-placeholder)' }}>1/3</span>
                </div>
              </div>
              {/* Sample tasks */}
              {[
                t('dashboardSampleTask1', lang),
                t('dashboardSampleTask2', lang),
                t('dashboardSampleTask3', lang),
              ].map((task, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', borderRadius: 8,
                  background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                  opacity: 0.6, pointerEvents: 'none',
                }}>
                  <Square size={12} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{task}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Help button — replay onboarding */}
          {onShowOnboarding && (
            <button
              className="btn text-sm"
              onClick={onShowOnboarding}
              style={{ marginTop: 16, color: 'var(--text-placeholder)', gap: 6, display: 'flex', alignItems: 'center' }}
            >
              <HelpCircle size={14} />
              {t('dashboardHelpTooltip', lang)}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Main dashboard ──
  return (
    <div className="workspace-content-wide">

        {/* ── Greeting (centered, Notion-style) ── */}
        <div className="text-center mt-xl" style={{ marginBottom: 36, position: 'relative' }}>
          <div className="font-extrabold" style={{ fontSize: 32, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
            {getGreeting(lang)}
          </div>
          {onShowOnboarding && (
            <button
              className="btn-icon dashboard-help-btn"
              onClick={onShowOnboarding}
              title={t('dashboardHelpTooltip', lang)}
              aria-label={t('dashboardHelpTooltip', lang)}
              style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
            >
              <HelpCircle size={18} />
            </button>
          )}
        </div>

        {/* ── Nudge cards (extracted component) ── */}
        <NudgeCards
          todos={todos}
          masterNotes={masterNotes}
          logs={logs}
          handoffLogs={handoffLogs}
          projects={projects}
          lang={lang}
          onOpenTodos={onOpenTodos}
          onOpenSummaryList={onOpenSummaryList}
          onOpenHistory={onOpenHistory}
          onOpenProject={onOpenProject}
        />

        {/* ── Quick access cards (horizontal scroll) ── */}
        {(lastActiveProject || projectSnapshots.length > 0) && (
          <div className="mb-2xl">
            <div className="section-header">
              <PlayCircle size={14} style={{ opacity: 0.5 }} />
              {t('dashboardRecentProjects', lang)}
            </div>
            <div className="flex" style={{ gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, marginBottom: -8 }}>
              {projectSnapshots.slice(0, 5).map((snap) => {
                const pct = snap.totalCount > 0 ? ((snap.totalCount - snap.pendingCount) / snap.totalCount) * 100 : 0;
                return (
                  <button
                    type="button"
                    key={snap.project.id}
                    aria-label={`${t('ariaOpenProject', lang)}: ${snap.project.name}`}
                    onClick={() => onOpenProject(snap.project.id)}
                    style={{
                      flex: '1 1 160px', minWidth: 160, maxWidth: 280, padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      transition: 'all 0.15s ease', flexShrink: 0, textAlign: 'left',
                    }}
                    className="project-snap-card"
                  >
                    <div style={{ fontSize: 24, marginBottom: 10, lineHeight: 1 }}>{snap.project.icon || '📂'}</div>
                    <div className="truncate font-semibold text-sm text-secondary" style={{ marginBottom: 4 }}>
                      {snap.project.name}
                    </div>
                    {snap.totalCount > 0 && (
                      <div className="flex-row" style={{ gap: 6, marginTop: 6 }}>
                        <div className="progress-bar-mini">
                          <div className="progress-bar-mini-fill" style={{ background: pct === 100 ? 'var(--success-text)' : 'var(--accent)', width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0" style={{ fontSize: 10, color: 'var(--text-placeholder)' }}>{snap.totalCount - snap.pendingCount}/{snap.totalCount}</span>
                      </div>
                    )}
                  </button>
                );
              })}
              {/* New log card */}
              <button
                type="button"
                onClick={onNewLog}
                aria-label={t('ariaCreateNewLog', lang)}
                style={{
                  minWidth: 100, padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
                  border: '1px dashed var(--border-subtle)', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  color: 'var(--text-placeholder)', transition: 'all 0.15s ease', flexShrink: 0,
                }}
                className="new-log-card"
              >
                <Plus size={20} />
                <span className="fs-11 font-semibold">{t('dashboardNew', lang)}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Today's Focus ── */}
        {focusTasks.length > 0 && (
          <div className="mb-2xl">
            <div className="section-header">
              <Square size={14} style={{ opacity: 0.5 }} />
              {t('dashboardTodayFocus', lang)}
              {uncheckedActions.length > 0 && (
                <span className="badge badge-accent font-bold" style={{ fontSize: 11, marginLeft: 4 }}>
                  {uncheckedActions.length}
                </span>
              )}
              {totalActions > 0 && (
                <span className="ml-auto" style={{ fontSize: 11, color: 'var(--text-placeholder)' }}>
                  {checkedCount}/{totalActions}
                </span>
              )}
            </div>
            <div className="flex-col gap-xs">
              {focusTasks.map((action) => (
                <button
                  type="button"
                  key={`${action.logId}-${action.index}`}
                  aria-label={`${t('ariaToggleAction', lang)}: ${action.text}`}
                  onClick={() => onToggleAction(action.logId, action.index)}
                  style={{
                    gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 13, lineHeight: 1.5,
                    background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                    userSelect: 'none', transition: 'all 0.12s ease', textAlign: 'left', width: '100%',
                  }}
                  className="focus-task-item flex-row"
                >
                  <Square size={14} className="shrink-0" style={{ color: 'var(--text-placeholder)' }} />
                  <span className="flex-1" style={{ color: 'var(--text-body)', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{action.text}</span>
                  {action.projectName && (
                    <span className="badge badge-accent shrink-0" style={{ borderRadius: 4 }}>
                      {action.projectName}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {uncheckedActions.length > 5 && (
              <button
                onClick={() => setMoreTasksOpen(!moreTasksOpen)}
                className="flex-row text-sm-muted"
                style={{ gap: 4, color: 'var(--text-placeholder)', background: 'none', border: 'none', padding: '8px 0 0', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {moreTasksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>{tf('dashboardMoreTasks', lang, uncheckedActions.length - 5)}</span>
              </button>
            )}
            {moreTasksOpen && (
              <div className="flex-col" style={{ gap: 3, marginTop: 6 }}>
                {uncheckedActions.slice(5, 25).map((action) => (
                  <button
                    type="button"
                    key={`${action.logId}-${action.index}`}
                    aria-label={`${t('ariaToggleAction', lang)}: ${action.text}`}
                    onClick={() => onToggleAction(action.logId, action.index)}
                    className="flex-row text-sm-muted cursor-pointer select-none"
                    style={{ gap: 8, padding: '6px 14px', borderRadius: 8, background: 'none', border: 'none', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
                  >
                    <Square size={12} className="shrink-0" style={{ color: 'var(--text-placeholder)' }} />
                    <span className="flex-1">{action.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Recently completed ── */}
        {recentlyDone.length > 0 && (
          <div className="mb-2xl" style={{ padding: '14px 16px', borderRadius: 12, background: 'color-mix(in srgb, var(--success-text, #22c55e) 4%, var(--card-bg))' }}>
            <div className="section-header">
              <CheckSquare size={14} style={{ color: 'var(--success-text)' }} />
              {t('dashboardDone', lang)}
            </div>
            <div className="flex-col gap-2">
              {recentlyDone.map((action) => (
                <div
                  key={`${action.logId}-${action.index}`}
                  className="flex-row text-placeholder"
                  style={{ gap: 8, padding: '6px 0', fontSize: 12 }}
                >
                  <CheckSquare size={13} className="shrink-0" style={{ color: 'var(--success-text)' }} />
                  <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{action.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Blockers (if any, red-tinted) ── */}
        {projectSnapshots.some((s) => s.blockers.length > 0) && (
          <div className="mb-2xl">
            <div className="section-header">
              <AlertTriangle size={14} style={{ opacity: 0.5, color: 'var(--error-text, #ef4444)' }} />
              {t('dashboardBlockers', lang)}
            </div>
            <div className="flex-col gap-xs">
              {projectSnapshots.filter((s) => s.blockers.length > 0).slice(0, 3).map((snap) => (
                <button
                  type="button"
                  key={snap.project.id}
                  aria-label={`${snap.project.name}: ${snap.blockers[0]}`}
                  onClick={() => onOpenProject(snap.project.id)}
                  className="cursor-pointer" style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', background: 'color-mix(in srgb, var(--error-text, #ef4444) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--error-text, #ef4444) 10%, transparent)', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
                >
                  <span className="font-semibold text-secondary">{snap.project.icon || '📂'} {snap.project.name}</span>
                  <span style={{ margin: '0 6px', opacity: 0.3 }}>—</span>
                  {snap.blockers[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Your Activity (summary card) ── */}
        <ActivitySummaryCard logs={logs} todos={todos} projects={projects} lang={lang} />

        {/* #36 View Weekly Report button */}
        {onOpenWeeklyReport && (
          <div className="mb-2xl">
            <button
              className="btn"
              onClick={onOpenWeeklyReport}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <FileText size={14} />
              {t('viewWeeklyReport', lang)}
            </button>
          </div>
        )}

        {/* ── Trends ── */}
        <TrendsSection logs={logs} todos={todos} lang={lang} />

    </div>
  );
}

export default memo(DashboardView);

