import { useMemo, useState, useCallback, memo } from 'react';
import { Square, CheckSquare, AlertTriangle, ChevronDown, ChevronRight, Plus, PlayCircle, Clock, FileText, FolderOpen, TrendingUp } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getGreeting } from './greeting';
import { getStreak, safeGetItem, safeSetItem } from './storage';
import FirstUseTooltip from './FirstUseTooltip';
import { EmptyDashboard } from './EmptyIllustrations';

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

// ── Notification dismissal ──
const DISMISS_KEY = 'threadlog_notification_dismissals';
function loadDismissals(): Record<string, number> {
  try { return JSON.parse(safeGetItem(DISMISS_KEY) || '{}'); } catch (err) { if (import.meta.env.DEV) console.warn('[DashboardView] loadDismissals:', err); return {}; }
}
function saveDismissals(keys: string[]) {
  const d = loadDismissals();
  const now = Date.now();
  for (const k of keys) d[k] = now;
  safeSetItem(DISMISS_KEY, JSON.stringify(d));
}
function isNotDismissed(key: string, latestActivityTs: number): boolean {
  const d = loadDismissals();
  const dismissedAt = d[key];
  if (!dismissedAt) return true;
  return latestActivityTs > dismissedAt;
}

function DashboardView({ logs, projects, todos, masterNotes, lang, onOpenProject, onOpenTodos, onOpenSummaryList, onOpenHistory, onNewLog, onToggleAction }: DashboardViewProps) {
  const [moreTasksOpen, setMoreTasksOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const saved = safeGetItem(DISMISS_KEY);
      if (saved) {
        const entries: Record<string, number> = JSON.parse(saved);
        return new Set(Object.keys(entries));
      }
    } catch (err) { if (import.meta.env.DEV) console.warn('[DashboardView] dismissed parse:', err); }
    return new Set();
  });

  const dismissAll = useCallback((keys: string[]) => {
    saveDismissals(keys);
    setDismissed((prev) => { const next = new Set(prev); for (const k of keys) next.add(k); return next; });
  }, []);

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

  // ── Nudge cards ──
  const nudges = useMemo(() => {
    const items: { key: string; emoji: string; label: string; sub: string; color: string; borderColor: string; icon: typeof Clock; onClick: () => void; dismissKeys: string[] }[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Overdue TODOs
    const overdueTodos = todos.filter((td) => !td.done && td.dueDate && td.dueDate < today);
    if (overdueTodos.length > 0 && !dismissed.has('overdue_todos') && isNotDismissed('overdue_todos', Math.max(...overdueTodos.map((td) => td.createdAt)))) {
      items.push({
        key: 'overdue_todos',
        emoji: '⏰',
        label: tf('nudgeOverdue', lang, overdueTodos.length),
        sub: 'TODO',
        color: 'var(--error-text, #ef4444)',
        borderColor: 'var(--error-text, #ef4444)',
        icon: Clock,
        onClick: onOpenTodos,
        dismissKeys: ['overdue_todos'],
      });
    }

    // Stale summaries
    const staleProjectIds: string[] = [];
    for (const note of masterNotes) {
      const projectHandoffs = logs.filter((l) => l.projectId === note.projectId && l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > note.updatedAt);
      if (projectHandoffs.length === 0) continue;
      const latestTs = Math.max(...projectHandoffs.map((l) => new Date(l.createdAt).getTime()));
      if (!dismissed.has(`summary_${note.projectId}`) && isNotDismissed(`summary_${note.projectId}`, latestTs)) {
        staleProjectIds.push(note.projectId);
      }
    }
    if (staleProjectIds.length > 0) {
      items.push({
        key: 'stale_summaries',
        emoji: '📋',
        label: tf('nudgeStaleCount', lang, staleProjectIds.length),
        sub: t('nudgeStaleSub', lang),
        color: 'var(--warning-text)',
        borderColor: 'var(--warning-accent, orange)',
        icon: FileText,
        onClick: onOpenSummaryList,
        dismissKeys: staleProjectIds.map((id) => `summary_${id}`),
      });
    }

    // Stale projects (no logs in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoTs = thirtyDaysAgo.getTime();
    const staleProjects = projects.filter((p) => {
      const projectLogs = logs.filter((l) => l.projectId === p.id);
      if (projectLogs.length === 0) return false; // skip projects with no logs at all
      const latestLogTs = Math.max(...projectLogs.map((l) => new Date(l.createdAt).getTime()));
      return latestLogTs < thirtyDaysAgoTs;
    });
    if (staleProjects.length > 0 && !dismissed.has('stale_projects')) {
      const staleKeys = staleProjects.map((p) => `stale_project_${p.id}`);
      const anyNotDismissed = staleProjects.some((p) => {
        const projectLogs = logs.filter((l) => l.projectId === p.id);
        const latestTs = Math.max(...projectLogs.map((l) => new Date(l.createdAt).getTime()));
        return isNotDismissed(`stale_project_${p.id}`, latestTs);
      });
      if (anyNotDismissed) {
        const staleNames = staleProjects.slice(0, 3).map((p) => p.icon ? `${p.icon} ${p.name}` : p.name).join(', ');
        items.push({
          key: 'stale_projects',
          emoji: '💤',
          label: lang === 'ja'
            ? `${staleProjects.length}件のプロジェクトが30日以上未更新`
            : `${staleProjects.length} project${staleProjects.length > 1 ? 's' : ''} idle for 30+ days`,
          sub: staleNames,
          color: 'var(--text-placeholder)',
          borderColor: 'var(--text-placeholder)',
          icon: FolderOpen,
          onClick: () => { if (staleProjects.length === 1) onOpenProject(staleProjects[0].id); else onOpenHistory(); },
          dismissKeys: ['stale_projects', ...staleKeys],
        });
      }
    }

    // Unassigned logs
    const unassignedCount = handoffLogs.filter((l) => !l.projectId).length;
    if (unassignedCount > 0 && !dismissed.has('unassigned') && isNotDismissed('unassigned', handoffLogs.length > 0 ? new Date(handoffLogs[0].createdAt).getTime() : 0)) {
      items.push({
        key: 'unassigned',
        emoji: '📂',
        label: tf('nudgeUnassigned', lang, unassignedCount),
        sub: t('statsTotalLogs', lang),
        color: 'var(--accent)',
        borderColor: 'var(--accent)',
        icon: FolderOpen,
        onClick: onOpenHistory,
        dismissKeys: ['unassigned'],
      });
    }

    return items;
  }, [todos, masterNotes, logs, handoffLogs, projects, dismissed, lang, onOpenTodos, onOpenSummaryList, onOpenHistory, onOpenProject]);

  const focusTasks = uncheckedActions.slice(0, 5);

  // ── Empty state ──
  if (handoffLogs.length === 0) {
    return (
      <div className="workspace-content-wide flex-col items-center">
        <div className="text-center" className="font-extrabold" style={{ fontSize: 28, color: 'var(--text-secondary)', marginTop: 80, marginBottom: 32 }}>
          {getGreeting(lang)}
        </div>
        <div className="empty-state">
          <div className="empty-state-icon"><EmptyDashboard /></div>
          <p className="font-semibold">
            {t('dashboardWelcome', lang)}
          </p>
          <p className="page-subtitle">
            {t('dashboardWelcomeDesc', lang)}
          </p>
          <FirstUseTooltip id="dashboard" text={lang === 'ja' ? 'AIプロジェクトのスナップショットがここに表示されます' : 'Your AI project snapshots appear here'} position="top">
            <button className="btn btn-primary" onClick={onNewLog} className="mt-lg">
              <Plus size={16} />
              {t('dashboardCreateFirstLog', lang)}
            </button>
          </FirstUseTooltip>
        </div>
      </div>
    );
  }

  // ── Main dashboard ──
  return (
    <div className="workspace-content-wide">

        {/* ── Greeting (centered, Notion-style) ── */}
        <div className="text-center" className="mt-xl" style={{ marginBottom: 36 }}>
          <div className="font-extrabold" style={{ fontSize: 32, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
            {getGreeting(lang)}
          </div>
        </div>

        {/* ── Nudge cards (top of dashboard, prominent with left border + icons) ── */}
        {nudges.length > 0 && (
          <div className="mb-2xl">
            <div className="flex flex-wrap" style={{ gap: 10 }}>
              {nudges.map((n) => {
                const IconComponent = n.icon;
                return (
                <div
                  key={n.key}
                  role="button"
                  tabIndex={0}
                  aria-label={n.label}
                  onClick={() => { n.onClick(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.onClick(); } }}
                  style={{
                    flex: '1 1 160px', minWidth: 140, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    background: `color-mix(in srgb, ${n.color} 6%, var(--card-bg))`,
                    border: `1px solid color-mix(in srgb, ${n.color} 15%, transparent)`,
                    borderLeft: `4px solid ${n.borderColor}`,
                    transition: 'all 0.15s ease', position: 'relative',
                  }}
                  className="nudge-card"
                >
                  <div className="flex-row" style={{ fontSize: 20, marginBottom: 8, gap: 6 }}>
                    <IconComponent size={20} style={{ color: n.borderColor }} />
                  </div>
                  <div className="font-bold text-secondary text-sm">{n.label}</div>
                  <div className="text-xs-muted" style={{ marginTop: 2 }}>{n.sub}</div>
                  {/* dismiss tap target */}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissAll(n.dismissKeys); }}
                    aria-label={t('ariaDismissNotification', lang)}
                    className="nudge-dismiss-btn"
                    style={{
                      position: 'absolute', top: 0, right: 0,
                      width: 44, height: 44, borderRadius: '50%', border: 'none',
                      background: 'transparent',
                      color: 'var(--text-placeholder)', fontSize: 11, lineHeight: 1,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                  >×</button>
                </div>
                );
              })}
            </div>
            {/* Show × on card hover */}
            <style>{`.nudge-card:hover > .nudge-dismiss-btn { opacity: 0.5 !important; } .nudge-card:focus-within > .nudge-dismiss-btn { opacity: 0.5 !important; }`}</style>
          </div>
        )}

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
                  <div
                    key={snap.project.id}
                    role="button"
                    tabIndex={0}
                    aria-label={snap.project.name}
                    onClick={() => onOpenProject(snap.project.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenProject(snap.project.id); } }}
                    style={{
                      flex: '1 1 160px', minWidth: 160, maxWidth: 280, padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      transition: 'all 0.15s ease', flexShrink: 0,
                    }}
                    className="project-snap-card"
                  >
                    <div style={{ fontSize: 24, marginBottom: 10, lineHeight: 1 }}>{snap.project.icon || '📂'}</div>
                    <div className="truncate font-semibold" className="text-sm text-secondary" style={{ marginBottom: 4 }}>
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
                  </div>
                );
              })}
              {/* New log card */}
              <div
                role="button"
                tabIndex={0}
                onClick={onNewLog}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNewLog(); } }}
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
                <span style={{ fontSize: 11, fontWeight: 600 }}>{t('dashboardNew', lang)}</span>
              </div>
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
                <span className="badge badge-accent" className="font-bold" style={{ fontSize: 11, marginLeft: 4 }}>
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
                <div
                  key={`${action.logId}-${action.index}`}
                  role="button"
                  tabIndex={0}
                  aria-label={action.text}
                  onClick={() => onToggleAction(action.logId, action.index)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleAction(action.logId, action.index); } }}
                  style={{
                    gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 13, lineHeight: 1.5,
                    background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                    userSelect: 'none', transition: 'all 0.12s ease',
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
                </div>
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
                  <div
                    key={`${action.logId}-${action.index}`}
                    role="button"
                    tabIndex={0}
                    aria-label={action.text}
                    onClick={() => onToggleAction(action.logId, action.index)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleAction(action.logId, action.index); } }}
                    className="flex-row text-sm-muted"
                    className="cursor-pointer select-none" style={{ gap: 8, padding: '6px 14px', borderRadius: 8 }}
                  >
                    <Square size={12} className="shrink-0" style={{ color: 'var(--text-placeholder)' }} />
                    <span className="flex-1">{action.text}</span>
                  </div>
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
            <div className="flex-col" style={{ gap: 2 }}>
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
                <div
                  key={snap.project.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${snap.project.name}: ${snap.blockers[0]}`}
                  onClick={() => onOpenProject(snap.project.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenProject(snap.project.id); } }}
                  className="cursor-pointer" style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', background: 'color-mix(in srgb, var(--error-text, #ef4444) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--error-text, #ef4444) 10%, transparent)' }}
                >
                  <span className="font-semibold text-secondary">{snap.project.icon || '📂'} {snap.project.name}</span>
                  <span style={{ margin: '0 6px', opacity: 0.3 }}>—</span>
                  {snap.blockers[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Your Activity (summary card) ── */}
        <ActivitySummaryCard logs={logs} todos={todos} projects={projects} lang={lang} />

        {/* ── Trends ── */}
        <TrendsSection logs={logs} todos={todos} lang={lang} />

    </div>
  );
}

export default memo(DashboardView);

// ── Activity Summary Card ──

function ActivitySummaryCard({ logs, todos, projects, lang }: { logs: LogEntry[]; todos: Todo[]; projects: Project[]; lang: Lang }) {
  const streak = useMemo(() => getStreak(), []);

  const stats = useMemo(() => {
    const totalLogs = logs.length;
    const todosDone = todos.filter((td) => td.done).length;
    const todosPending = todos.filter((td) => !td.done).length;
    const activeProjects = projects.filter((p) => logs.some((l) => l.projectId === p.id)).length;

    // Logs this week vs last week
    const now = new Date();
    const weekStart = getWeekStart(now);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekLogs = logs.filter((l) => new Date(l.createdAt) >= weekStart).length;
    const lastWeekLogs = logs.filter((l) => {
      const d = new Date(l.createdAt);
      return d >= lastWeekStart && d < weekStart;
    }).length;
    const weekDiff = thisWeekLogs - lastWeekLogs;

    // Most active project
    const projectCounts: Record<string, number> = {};
    for (const l of logs) {
      if (l.projectId) projectCounts[l.projectId] = (projectCounts[l.projectId] || 0) + 1;
    }
    let topProjectName: string | null = null;
    let topCount = 0;
    for (const [pid, count] of Object.entries(projectCounts)) {
      if (count > topCount) {
        topCount = count;
        const proj = projects.find((p) => p.id === pid);
        topProjectName = proj ? `${proj.icon || '📂'} ${proj.name}` : null;
      }
    }

    return { totalLogs, todosDone, todosPending, activeProjects, thisWeekLogs, lastWeekLogs, weekDiff, topProjectName, topCount };
  }, [logs, todos, projects]);

  if (stats.totalLogs === 0) return null;

  const diffLabel = stats.weekDiff >= 0 ? `+${stats.weekDiff}` : `${stats.weekDiff}`;
  const diffColor = stats.weekDiff >= 0 ? 'var(--success-text, #22c55e)' : 'var(--error-text, #ef4444)';
  const isJa = lang === 'ja';

  return (
    <div className="mb-2xl">
      <div
        style={{
          padding: '18px 22px', borderRadius: 12,
          background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex-row justify-between mb-md">
          <div className="section-title font-semibold" className="font-bold">
            {isJa ? 'あなたのアクティビティ' : 'Your Activity'}
          </div>
          {streak > 0 && (
            <div className="flex-row" style={{ gap: 4, fontSize: 13, color: 'var(--warning-text, #f59e0b)' }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span className="font-extrabold" style={{ fontSize: 20 }}>{streak}</span>
              <span className="font-semibold">{isJa ? '日連続' : `day${streak > 1 ? 's' : ''} streak`}</span>
            </div>
          )}
        </div>

        {/* Row 1: headline stats */}
        <div className="flex flex-wrap" className="items-baseline" style={{ gap: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <span className="font-extrabold text-secondary" style={{ fontSize: 22 }}>{stats.totalLogs}</span>
          <span>{isJa ? 'ログ' : 'logs'}</span>
          <span style={{ color: 'var(--text-placeholder)', margin: '0 2px' }}>&middot;</span>
          <span className="font-extrabold text-secondary" style={{ fontSize: 22 }}>{stats.todosDone}</span>
          <span>{isJa ? 'TODO完了' : 'TODOs done'}</span>
          <span style={{ color: 'var(--text-placeholder)', margin: '0 2px' }}>&middot;</span>
          <span className="font-extrabold text-secondary" style={{ fontSize: 22 }}>{stats.activeProjects}</span>
          <span>{isJa ? 'プロジェクト' : 'projects'}</span>
        </div>

        {/* Row 2: this week comparison */}
        <div className="mt-sm" className="text-sm text-muted">
          {isJa ? '今週' : 'This week'}: <span className="font-bold text-secondary">{stats.thisWeekLogs}</span> {isJa ? 'ログ' : 'logs'}
          {' '}
          <span style={{ color: diffColor, fontWeight: 600 }}>
            ({diffLabel} {isJa ? '先週比' : 'from last week'})
          </span>
        </div>

        {/* Row 3: most active project */}
        {stats.topProjectName && (
          <div className="text-xs-placeholder" style={{ marginTop: 6 }}>
            {isJa ? '最も活発:' : 'Most active:'} <span className="text-muted font-semibold">{stats.topProjectName}</span>
            <span style={{ opacity: 0.6 }}> ({stats.topCount} {isJa ? 'ログ' : 'logs'})</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Trends Section Component ──

interface WeekBucket {
  label: string;
  logCount: number;
  todosCompleted: number;
  todosTotal: number;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
}

function TrendsSection({ logs, todos, lang }: { logs: LogEntry[]; todos: Todo[]; lang: Lang }) {
  const weeklyData = useMemo(() => {
    const now = new Date();
    const currentWeekStart = getWeekStart(now);

    // Build 4 week buckets (current week + 3 previous)
    const buckets: WeekBucket[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      // Count logs in this week
      const logCount = logs.filter((l) => {
        const d = new Date(l.createdAt);
        return d >= weekStart && d < weekEnd;
      }).length;

      // Count todos created in this week window
      const wsTime = weekStart.getTime();
      const weTime = weekEnd.getTime();
      const weekTodos = todos.filter((td) => {
        const ts = typeof td.createdAt === 'number' ? td.createdAt : new Date(td.createdAt).getTime();
        return ts >= wsTime && ts < weTime;
      });
      const todosCompleted = weekTodos.filter((td) => td.done).length;
      const todosTotal = weekTodos.length;

      buckets.push({
        label: formatWeekLabel(weekStart),
        logCount,
        todosCompleted,
        todosTotal,
      });
    }
    return buckets;
  }, [logs, todos]);

  const maxCount = Math.max(1, ...weeklyData.map((w) => w.logCount));

  // Metrics
  const thisWeekCount = weeklyData[3]?.logCount ?? 0;
  const lastWeekCount = weeklyData[2]?.logCount ?? 0;
  const avgPerWeek = weeklyData.length > 0
    ? Math.round((weeklyData.reduce((s, w) => s + w.logCount, 0) / weeklyData.length) * 10) / 10
    : 0;

  const changePct = lastWeekCount > 0
    ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
    : thisWeekCount > 0 ? 100 : 0;
  const changeUp = changePct >= 0;

  const totalTodosCompleted = weeklyData.reduce((s, w) => s + w.todosCompleted, 0);
  const totalTodosAll = weeklyData.reduce((s, w) => s + w.todosTotal, 0);
  const completionRate = totalTodosAll > 0 ? Math.round((totalTodosCompleted / totalTodosAll) * 100) : 0;

  if (logs.length === 0) return null;

  return (
    <div className="mb-2xl">
      <div className="section-header" style={{ marginBottom: 14 }}>
        <TrendingUp size={14} style={{ opacity: 0.5 }} />
        {t('trends', lang)}
      </div>

      {/* Weekly activity bars */}
      <div className="flex-col gap-sm mb-lg">
        {weeklyData.map((week, i) => (
          <div key={i} className="flex-row" style={{ gap: 10 }}>
            <span className="text-xs-placeholder shrink-0" style={{ width: 70, textAlign: 'right' }}>
              {week.label}
            </span>
            <div style={{ flex: 1, height: 18, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(week.logCount / maxCount) * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                  minWidth: week.logCount > 0 ? 4 : 0,
                }}
              />
            </div>
            <span className="text-xs-muted shrink-0" style={{ width: 50 }}>
              {tf('logsCount', lang, week.logCount)}
            </span>
          </div>
        ))}
      </div>

      {/* Key metrics row */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        {/* This week vs last week */}
        <div className="stat-card p-card" className="stat-card-flex">
          <div className="stat-label" style={{ marginTop: 0, marginBottom: 4 }}>
            {t('vsLastWeek', lang)}
          </div>
          <div className="stat-value" style={{ fontSize: 18, color: changeUp ? 'var(--success-text, #22c55e)' : 'var(--error-text, #ef4444)' }}>
            {changeUp ? '↑' : '↓'} {Math.abs(changePct)}%
          </div>
        </div>

        {/* Average logs per week */}
        <div className="stat-card p-card" className="stat-card-flex">
          <div className="stat-label" style={{ marginTop: 0, marginBottom: 4 }}>
            {t('avgPerWeek', lang)}
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {avgPerWeek}
          </div>
        </div>

        {/* TODO completion rate */}
        <div className="stat-card p-card" className="stat-card-flex">
          <div className="stat-label" style={{ marginTop: 0, marginBottom: 4 }}>
            {t('completionRate', lang)}
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {completionRate}%
          </div>
        </div>
      </div>
    </div>
  );
}
