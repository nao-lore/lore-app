import { useMemo, useState, useCallback } from 'react';
import { Clock, FileText, FolderOpen } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { safeGetItem, safeSetItem } from '../storage';

// ── Notification dismissal ──
const DISMISS_KEY = 'threadlog_notification_dismissals';
function loadDismissals(): Record<string, number> {
  try { return JSON.parse(safeGetItem(DISMISS_KEY) || '{}'); } catch { return {}; }
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

interface NudgeCardsProps {
  todos: Todo[];
  masterNotes: MasterNote[];
  logs: LogEntry[];
  handoffLogs: LogEntry[];
  projects: Project[];
  lang: Lang;
  onOpenTodos: () => void;
  onOpenSummaryList: () => void;
  onOpenHistory: () => void;
  onOpenProject: (projectId: string) => void;
}

export default function NudgeCards({ todos, masterNotes, logs, handoffLogs, projects, lang, onOpenTodos, onOpenSummaryList, onOpenHistory, onOpenProject }: NudgeCardsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const saved = safeGetItem(DISMISS_KEY);
      if (saved) {
        const entries: Record<string, number> = JSON.parse(saved);
        return new Set(Object.keys(entries));
      }
    } catch { /* ignore */ }
    return new Set();
  });

  const dismissAll = useCallback((keys: string[]) => {
    saveDismissals(keys);
    setDismissed((prev) => { const next = new Set(prev); for (const k of keys) next.add(k); return next; });
  }, []);

  const nudges = useMemo(() => {
    const items: { key: string; label: string; sub: string; color: string; borderColor: string; icon: typeof Clock; onClick: () => void; dismissKeys: string[] }[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Overdue TODOs
    const overdueTodos = todos.filter((td) => !td.done && td.dueDate && td.dueDate < today);
    if (overdueTodos.length > 0 && !dismissed.has('overdue_todos') && isNotDismissed('overdue_todos', Math.max(...overdueTodos.map((td) => td.createdAt)))) {
      items.push({
        key: 'overdue_todos',
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
        label: tf('nudgeStaleCount', lang, staleProjectIds.length),
        sub: t('nudgeStaleSub', lang),
        color: 'var(--warning-text)',
        borderColor: 'var(--warning-accent, orange)',
        icon: FileText,
        onClick: onOpenSummaryList,
        dismissKeys: staleProjectIds.map((id) => `summary_${id}`),
      });
    }

    // Stale projects
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoTs = thirtyDaysAgo.getTime();
    const staleProjects = projects.filter((p) => {
      const projectLogs = logs.filter((l) => l.projectId === p.id);
      if (projectLogs.length === 0) return false;
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
          label: lang === 'ja'
            ? `${staleProjects.length}\u4ef6\u306e\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u304c30\u65e5\u4ee5\u4e0a\u672a\u66f4\u65b0`
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

  if (nudges.length === 0) return null;

  return (
    <div className="mb-2xl">
      <div className="flex flex-wrap" style={{ gap: 10 }}>
        {nudges.map((n) => {
          const IconComponent = n.icon;
          return (
            <button
              type="button"
              key={n.key}
              aria-label={n.label}
              onClick={() => { n.onClick(); }}
              style={{
                flex: '1 1 160px', minWidth: 140, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: `color-mix(in srgb, ${n.color} 6%, var(--card-bg))`,
                border: `1px solid color-mix(in srgb, ${n.color} 15%, transparent)`,
                borderLeft: `4px solid ${n.borderColor}`,
                transition: 'all 0.15s ease', position: 'relative',
                textAlign: 'left',
              }}
              className="nudge-card"
            >
              <div className="flex-row" style={{ fontSize: 20, marginBottom: 8, gap: 6 }}>
                <IconComponent size={20} style={{ color: n.borderColor }} />
              </div>
              <div className="font-bold text-secondary text-sm">{n.label}</div>
              <div className="text-xs-muted" style={{ marginTop: 2 }}>{n.sub}</div>
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
              >{'\u00d7'}</button>
            </button>
          );
        })}
      </div>
      <style>{`.nudge-card:hover > .nudge-dismiss-btn { opacity: 0.5 !important; } .nudge-card:focus-within > .nudge-dismiss-btn { opacity: 0.5 !important; }`}</style>
    </div>
  );
}
