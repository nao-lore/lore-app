import { useMemo, useState, useCallback } from 'react';
import { Square, CheckSquare, AlertTriangle, ChevronDown, ChevronRight, Plus, PlayCircle, Clock, FileText, FolderOpen, TrendingUp } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getGreeting } from './greeting';

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
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}'); } catch { return {}; }
}
function saveDismissals(keys: string[]) {
  const d = loadDismissals();
  const now = Date.now();
  for (const k of keys) d[k] = now;
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
function isNotDismissed(key: string, latestActivityTs: number): boolean {
  const d = loadDismissals();
  const dismissedAt = d[key];
  if (!dismissedAt) return true;
  return latestActivityTs > dismissedAt;
}

export default function DashboardView({ logs, projects, todos, masterNotes, lang, onOpenProject, onOpenTodos, onOpenSummaryList, onOpenHistory, onNewLog, onToggleAction }: DashboardViewProps) {
  const [moreTasksOpen, setMoreTasksOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DISMISS_KEY);
      if (saved) {
        const entries = JSON.parse(saved) as Record<string, number>;
        return new Set(Object.keys(entries));
      }
    } catch { /* ignore */ }
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
  }, [todos, masterNotes, logs, handoffLogs, dismissed, lang, onOpenTodos, onOpenSummaryList, onOpenHistory]);

  const focusTasks = uncheckedActions.slice(0, 5);

  // ── Empty state ──
  if (handoffLogs.length === 0) {
    return (
      <div className="workspace-content-wide" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-secondary)', marginTop: 80, marginBottom: 32, textAlign: 'center' }}>
          {getGreeting(lang)}
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">&#10024;</div>
          <p style={{ fontWeight: 600 }}>
            {t('dashboardWelcome', lang)}
          </p>
          <p className="page-subtitle">
            {t('dashboardWelcomeDesc', lang)}
          </p>
          <button className="btn btn-primary" onClick={onNewLog} style={{ marginTop: 16 }}>
            <Plus size={16} />
            {t('dashboardCreateFirstLog', lang)}
          </button>
        </div>
      </div>
    );
  }

  // ── Main dashboard ──
  return (
    <div className="workspace-content-wide">

        {/* ── Greeting (centered, Notion-style) ── */}
        <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 36 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
            {getGreeting(lang)}
          </div>
        </div>

        {/* ── Nudge cards (top of dashboard, prominent with left border + icons) ── */}
        {nudges.length > 0 && (
          <div style={{ marginBottom: 32 }}>
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
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'none'; }}
                >
                  <div style={{ fontSize: 20, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconComponent size={20} style={{ color: n.borderColor }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{n.sub}</div>
                  {/* dismiss tap target */}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissAll(n.dismissKeys); }}
                    aria-label={t('ariaDismissNotification', lang)}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 18, height: 18, borderRadius: '50%', border: 'none',
                      background: 'color-mix(in srgb, var(--text-placeholder) 15%, transparent)',
                      color: 'var(--text-placeholder)', fontSize: 11, lineHeight: 1,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                  >×</button>
                </div>
                );
              })}
            </div>
            {/* Show × on card hover */}
            <style>{`.workspace-content div:hover > button { opacity: 0.5 !important; }`}</style>
          </div>
        )}

        {/* ── Quick access cards (horizontal scroll) ── */}
        {(lastActiveProject || projectSnapshots.length > 0) && (
          <div style={{ marginBottom: 32 }}>
            <div className="section-header" style={{ fontSize: 13, marginBottom: 10 }}>
              <PlayCircle size={14} style={{ opacity: 0.5 }} />
              {t('dashboardRecentProjects', lang)}
            </div>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, marginBottom: -8 }}>
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
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--border-subtle)'; el.style.transform = 'none'; el.style.boxShadow = 'none'; }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 10, lineHeight: 1 }}>{snap.project.icon || '📂'}</div>
                    <div className="truncate font-semibold" style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {snap.project.name}
                    </div>
                    {snap.totalCount > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <div style={{ flex: 1, height: 3, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: pct === 100 ? 'var(--success-text)' : 'var(--accent)', borderRadius: 2, width: `${pct}%`, transition: 'width 0.3s ease' }} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-placeholder)', flexShrink: 0 }}>{snap.totalCount - snap.pendingCount}/{snap.totalCount}</span>
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
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--border-subtle)'; el.style.color = 'var(--text-placeholder)'; }}
              >
                <Plus size={20} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{t('dashboardNew', lang)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Today's Focus ── */}
        {focusTasks.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div className="section-header" style={{ fontSize: 13, marginBottom: 10 }}>
              <Square size={14} style={{ opacity: 0.5 }} />
              {t('dashboardTodayFocus', lang)}
              {uncheckedActions.length > 0 && (
                <span className="badge badge-accent" style={{ fontWeight: 700, fontSize: 11, marginLeft: 4 }}>
                  {uncheckedActions.length}
                </span>
              )}
              {totalActions > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-placeholder)' }}>
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
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 13, lineHeight: 1.5,
                    background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                    userSelect: 'none', transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
                >
                  <Square size={14} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: 'var(--text-body)', overflowWrap: 'break-word', wordBreak: 'break-word', minWidth: 0 }}>{action.text}</span>
                  {action.projectName && (
                    <span className="badge badge-accent" style={{ borderRadius: 4, flexShrink: 0 }}>
                      {action.projectName}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {uncheckedActions.length > 5 && (
              <button
                onClick={() => setMoreTasksOpen(!moreTasksOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-placeholder)', background: 'none', border: 'none', padding: '8px 0 0', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {moreTasksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>{tf('dashboardMoreTasks', lang, uncheckedActions.length - 5)}</span>
              </button>
            )}
            {moreTasksOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {uncheckedActions.slice(5, 25).map((action) => (
                  <div
                    key={`${action.logId}-${action.index}`}
                    role="button"
                    tabIndex={0}
                    aria-label={action.text}
                    onClick={() => onToggleAction(action.logId, action.index)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleAction(action.logId, action.index); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', userSelect: 'none' }}
                  >
                    <Square size={12} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{action.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Recently completed ── */}
        {recentlyDone.length > 0 && (
          <div style={{ marginBottom: 32, padding: '14px 16px', borderRadius: 12, background: 'color-mix(in srgb, var(--success-text, #22c55e) 4%, var(--card-bg))' }}>
            <div className="section-header" style={{ fontSize: 13, marginBottom: 10 }}>
              <CheckSquare size={14} style={{ color: 'var(--success-text)' }} />
              {t('dashboardDone', lang)}
            </div>
            <div className="flex-col" style={{ gap: 2 }}>
              {recentlyDone.map((action) => (
                <div
                  key={`${action.logId}-${action.index}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color: 'var(--text-placeholder)' }}
                >
                  <CheckSquare size={13} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                  <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{action.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Blockers (if any, red-tinted) ── */}
        {projectSnapshots.some((s) => s.blockers.length > 0) && (
          <div style={{ marginBottom: 32 }}>
            <div className="section-header" style={{ fontSize: 13, marginBottom: 10 }}>
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
                  style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', background: 'color-mix(in srgb, var(--error-text, #ef4444) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--error-text, #ef4444) 10%, transparent)' }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{snap.project.icon || '📂'} {snap.project.name}</span>
                  <span style={{ margin: '0 6px', opacity: 0.3 }}>—</span>
                  {snap.blockers[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Trends ── */}
        <TrendsSection logs={logs} todos={todos} lang={lang} />

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
    <div style={{ marginBottom: 32 }}>
      <div className="section-header" style={{ fontSize: 13, marginBottom: 14 }}>
        <TrendingUp size={14} style={{ opacity: 0.5 }} />
        {t('trends', lang)}
      </div>

      {/* Weekly activity bars */}
      <div className="flex-col gap-sm" style={{ marginBottom: 16 }}>
        {weeklyData.map((week, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-placeholder)', width: 70, flexShrink: 0, textAlign: 'right' }}>
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
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 50, flexShrink: 0 }}>
              {tf('logsCount', lang, week.logCount)}
            </span>
          </div>
        ))}
      </div>

      {/* Key metrics row */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        {/* This week vs last week */}
        <div className="stat-card" style={{ flex: '1 1 200px', padding: '14px 20px', borderRadius: 12, borderColor: 'var(--border-subtle)' }}>
          <div className="stat-label" style={{ marginTop: 0, marginBottom: 4 }}>
            {t('vsLastWeek', lang)}
          </div>
          <div className="stat-value" style={{ fontSize: 18, color: changeUp ? 'var(--success-text, #22c55e)' : 'var(--error-text, #ef4444)' }}>
            {changeUp ? '↑' : '↓'} {Math.abs(changePct)}%
          </div>
        </div>

        {/* Average logs per week */}
        <div className="stat-card" style={{ flex: '1 1 200px', padding: '14px 20px', borderRadius: 12, borderColor: 'var(--border-subtle)' }}>
          <div className="stat-label" style={{ marginTop: 0, marginBottom: 4 }}>
            {t('avgPerWeek', lang)}
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {avgPerWeek}
          </div>
        </div>

        {/* TODO completion rate */}
        <div className="stat-card" style={{ flex: '1 1 200px', padding: '14px 20px', borderRadius: 12, borderColor: 'var(--border-subtle)' }}>
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
