import { useMemo, useState, useCallback } from 'react';
import { Square, CheckSquare, AlertTriangle, ChevronDown, ChevronRight, Plus, PlayCircle, Sparkles } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from './types';
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
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

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

  const isJa = lang === 'ja';

  // ── Nudge cards ──
  const nudges = useMemo(() => {
    const items: { key: string; emoji: string; label: string; sub: string; color: string; onClick: () => void; dismissKeys: string[] }[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Overdue TODOs
    const overdueTodos = todos.filter((td) => !td.done && td.dueDate && td.dueDate < today);
    if (overdueTodos.length > 0 && !dismissed.has('overdue_todos') && isNotDismissed('overdue_todos', Math.max(...overdueTodos.map((td) => td.createdAt)))) {
      items.push({
        key: 'overdue_todos',
        emoji: '⏰',
        label: isJa ? `期限切れ ${overdueTodos.length}件` : `${overdueTodos.length} overdue`,
        sub: 'TODO',
        color: 'var(--danger-text, #ef4444)',
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
        label: isJa ? `更新推奨 ${staleProjectIds.length}件` : `${staleProjectIds.length} to update`,
        sub: isJa ? 'サマリー' : 'Summary',
        color: 'var(--warning-text)',
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
        label: isJa ? `未割当 ${unassignedCount}件` : `${unassignedCount} unassigned`,
        sub: isJa ? 'ログ' : 'Logs',
        color: 'var(--accent)',
        onClick: onOpenHistory,
        dismissKeys: ['unassigned'],
      });
    }

    return items;
  }, [todos, masterNotes, logs, handoffLogs, dismissed, isJa, onOpenTodos, onOpenSummaryList, onOpenHistory]);

  const focusTasks = uncheckedActions.slice(0, 5);

  // ── Empty state ──
  if (handoffLogs.length === 0) {
    return (
      <div className="workspace-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ marginTop: 80, textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 32 }}>
            {getGreeting(lang)}
          </div>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #a855f7))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(99,102,241,0.2)' }}>
            <Sparkles size={28} style={{ color: '#fff' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {isJa ? 'Loreへようこそ' : 'Welcome to Lore'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 32px', lineHeight: 1.7 }}>
            {isJa
              ? 'AIとの会話を貼り付けてHandoffを作成しましょう'
              : 'Paste an AI conversation and create a Handoff'}
          </p>
          <button className="btn btn-primary" onClick={onNewLog} style={{ padding: '10px 28px', fontSize: 14, borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} />
            {isJa ? '最初のHandoffを作成' : 'Create your first Handoff'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main dashboard ──
  return (
    <div className="workspace-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640 }}>

        {/* ── Greeting (centered, Notion-style) ── */}
        <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 36 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
            {getGreeting(lang)}
          </div>
        </div>

        {/* ── Quick access cards (horizontal scroll) ── */}
        {(lastActiveProject || projectSnapshots.length > 0) && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <PlayCircle size={14} style={{ opacity: 0.5 }} />
              {isJa ? '最近のプロジェクト' : 'Recent projects'}
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {projectSnapshots.slice(0, 5).map((snap) => {
                const pct = snap.totalCount > 0 ? ((snap.totalCount - snap.pendingCount) / snap.totalCount) * 100 : 0;
                return (
                  <div
                    key={snap.project.id}
                    onClick={() => onOpenProject(snap.project.id)}
                    style={{
                      minWidth: 140, maxWidth: 170, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      transition: 'all 0.15s ease', flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--border-subtle)'; el.style.transform = 'none'; el.style.boxShadow = 'none'; }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 10, lineHeight: 1 }}>{snap.project.icon || '📂'}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
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
                onClick={onNewLog}
                style={{
                  minWidth: 100, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: '1px dashed var(--border-subtle)', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  color: 'var(--text-placeholder)', transition: 'all 0.15s ease', flexShrink: 0,
                }}
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--border-subtle)'; el.style.color = 'var(--text-placeholder)'; }}
              >
                <Plus size={20} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{isJa ? '新規' : 'New'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Nudge cards (Notion-style, light tinted bg) ── */}
        {nudges.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {nudges.map((n) => (
                <div
                  key={n.key}
                  onClick={() => { n.onClick(); }}
                  style={{
                    flex: '1 1 160px', minWidth: 140, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    background: `color-mix(in srgb, ${n.color} 6%, var(--card-bg))`,
                    border: `1px solid color-mix(in srgb, ${n.color} 15%, transparent)`,
                    transition: 'all 0.15s ease', position: 'relative',
                  }}
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'none'; }}
                >
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{n.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{n.sub}</div>
                  {/* dismiss tap target */}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissAll(n.dismissKeys); }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 18, height: 18, borderRadius: '50%', border: 'none',
                      background: 'color-mix(in srgb, var(--text-placeholder) 15%, transparent)',
                      color: 'var(--text-placeholder)', fontSize: 11, lineHeight: 1,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  >×</button>
                </div>
              ))}
            </div>
            {/* Show × on card hover */}
            <style>{`.workspace-content div:hover > button { opacity: 0.5 !important; }`}</style>
          </div>
        )}

        {/* ── Today's Focus ── */}
        {focusTasks.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Square size={14} style={{ opacity: 0.5 }} />
              {isJa ? "今日のフォーカス" : "Today's Focus"}
              {totalActions > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-placeholder)' }}>
                  {checkedCount}/{totalActions}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {focusTasks.map((action, i) => (
                <div
                  key={i}
                  onClick={() => onToggleAction(action.logId, action.index)}
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
                  <span style={{ flex: 1, color: 'var(--text-body)' }}>{action.text}</span>
                  {action.projectName && (
                    <span style={{ fontSize: 10, color: 'var(--accent-text)', flexShrink: 0, padding: '2px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
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
                <span>{isJa ? `他 ${uncheckedActions.length - 5} 件` : `${uncheckedActions.length - 5} more`}</span>
              </button>
            )}
            {moreTasksOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {uncheckedActions.slice(5, 25).map((action, i) => (
                  <div
                    key={i}
                    onClick={() => onToggleAction(action.logId, action.index)}
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
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckSquare size={14} style={{ opacity: 0.5, color: 'var(--success-text)' }} />
              {isJa ? '完了' : 'Done'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentlyDone.map((action, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color: 'var(--text-placeholder)' }}
                >
                  <CheckSquare size={13} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                  <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{action.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Blockers (if any, subtle) ── */}
        {projectSnapshots.some((s) => s.blockers.length > 0) && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} style={{ opacity: 0.5, color: 'var(--warning-text)' }} />
              {isJa ? 'ブロッカー' : 'Blockers'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {projectSnapshots.filter((s) => s.blockers.length > 0).slice(0, 3).map((snap) => (
                <div
                  key={snap.project.id}
                  onClick={() => onOpenProject(snap.project.id)}
                  style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', background: 'color-mix(in srgb, var(--warning-text) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--warning-text) 10%, transparent)' }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{snap.project.icon || '📂'} {snap.project.name}</span>
                  <span style={{ margin: '0 6px', opacity: 0.3 }}>—</span>
                  {snap.blockers[0]}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
