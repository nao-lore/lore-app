import { useMemo, useState, useRef, useEffect, useCallback, memo } from 'react';
import { FileText, FolderOpen, CheckSquare, Trash2, BookOpen, PenTool, ArrowRightLeft, ChevronDown, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from './types';
import { WORKLOAD_CONFIG } from './workload';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ActivityHeatmap from './ActivityHeatmap';
import { EmptyTimeline } from './EmptyIllustrations';

type EventType = 'log' | 'handoff' | 'project' | 'summary' | 'todo-add' | 'todo-done' | 'todo-trash';
type FilterKey = 'all' | 'worklog' | 'handoff' | 'todo';

interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  timestamp: number;
  targetId?: string;      // id to navigate to
  targetType?: 'log' | 'project' | 'summary';
  projectName?: string;
  workloadLevel?: 'high' | 'medium' | 'low';
}

/** A single event or a collapsed group of todo-add events */
type DisplayItem =
  | { kind: 'event'; event: TimelineEvent }
  | { kind: 'todo-group'; events: TimelineEvent[]; hourKey: string };

interface TimelineViewProps {
  logs: LogEntry[];
  projects: Project[];
  todos: Todo[];
  masterNotes: MasterNote[];
  onBack: () => void;
  onOpenLog: (id: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSummary: (projectId: string) => void;
  onNewLog?: () => void;
  lang: Lang;
}

function buildEvents(
  logs: LogEntry[],
  projects: Project[],
  todos: Todo[],
  masterNotes: MasterNote[],
  projectMap: Map<string, Project>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Log / Handoff creation
  for (const log of logs) {
    const ts = new Date(log.createdAt).getTime();
    events.push({
      id: `log-${log.id}`,
      type: log.outputMode === 'handoff' ? 'handoff' : 'log',
      title: log.title,
      timestamp: ts,
      targetId: log.id,
      targetType: 'log',
      projectName: log.projectId ? projectMap.get(log.projectId)?.name : undefined,
      workloadLevel: log.workloadLevel,
    });
  }

  // Project creation
  for (const p of projects) {
    events.push({
      id: `proj-${p.id}`,
      type: 'project',
      title: p.name,
      timestamp: p.createdAt,
      targetId: p.id,
      targetType: 'project',
    });
  }

  // Master Note (Project Summary) generation / update
  for (const mn of masterNotes) {
    const proj = projectMap.get(mn.projectId);
    events.push({
      id: `mn-${mn.id}`,
      type: 'summary',
      title: proj?.name || mn.projectId,
      timestamp: mn.updatedAt,
      targetId: mn.projectId,
      targetType: 'summary',
      projectName: proj?.name,
    });
  }

  // Build TODO-added events
  for (const todo of todos) {
    events.push({
      id: `todo-add-${todo.id}`,
      type: 'todo-add',
      title: todo.text,
      timestamp: todo.createdAt,
    });

    // Build TODO-trashed events
    if (todo.trashedAt) {
      events.push({
        id: `todo-trash-${todo.id}`,
        type: 'todo-trash',
        title: todo.text,
        timestamp: todo.trashedAt,
      });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function formatDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(key: string, lang: Lang): string {
  const today = formatDateKey(Date.now());
  const yesterday = formatDateKey(Date.now() - 86400000);

  if (key === today) return t('timelineToday', lang);
  if (key === yesterday) return t('timelineYesterday', lang);

  const [y, m, d] = key.split('-').map(Number);
  return tf('timelineDateLabel', lang, y, m, d);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Get hour key for grouping: YYYY-MM-DD-HH */
function getHourKey(ts: number): string {
  const d = new Date(ts);
  return `${formatDateKey(ts)}-${String(d.getHours()).padStart(2, '0')}`;
}

const EVENT_CONFIG: Record<EventType, { label: (lang: Lang) => string; color: string; bg: string; border: string }> = {
  log: {
    label: () => 'Worklog',
    color: 'var(--accent-text)',
    bg: 'var(--accent-bg, rgba(99,102,241,0.08))',
    border: 'var(--accent, #6366f1)',
  },
  handoff: {
    label: () => 'Handoff',
    color: 'var(--warning-text, #b45309)',
    bg: 'var(--warning-bg, rgba(245,158,11,0.08))',
    border: 'var(--warning-dot, #f59e0b)',
  },
  project: {
    label: (lang) => t('timelineProjectCreated', lang),
    color: 'var(--success-text)',
    bg: 'var(--success-bg)',
    border: 'var(--success-border)',
  },
  summary: {
    label: (lang) => t('timelineSummaryUpdated', lang),
    color: 'var(--success-text)',
    bg: 'var(--success-bg)',
    border: 'var(--success-border)',
  },
  'todo-add': {
    label: (lang) => t('timelineTodoAdded', lang),
    color: 'var(--text-secondary)',
    bg: 'var(--sidebar-hover)',
    border: 'var(--border-default)',
  },
  'todo-done': {
    label: (lang) => t('timelineTodoDone', lang),
    color: 'var(--success-text)',
    bg: 'var(--success-bg)',
    border: 'var(--success-border)',
  },
  'todo-trash': {
    label: (lang) => t('timelineTodoDeleted', lang),
    color: 'var(--error-text)',
    bg: 'var(--tint-priority-high, rgba(239,68,68,0.06))',
    border: 'var(--error-border, #fca5a5)',
  },
};

const EVENT_ICON: Record<EventType, React.ReactNode> = {
  log: <PenTool size={14} />,
  handoff: <ArrowRightLeft size={14} />,
  project: <FolderOpen size={14} />,
  summary: <BookOpen size={14} />,
  'todo-add': <CheckSquare size={14} />,
  'todo-done': <CheckSquare size={14} />,
  'todo-trash': <Trash2 size={14} />,
};

const FILTER_TYPES: Record<FilterKey, Set<EventType>> = {
  all: new Set(['log', 'handoff', 'project', 'summary', 'todo-add', 'todo-done', 'todo-trash']),
  worklog: new Set(['log']),
  handoff: new Set(['handoff']),
  todo: new Set(['todo-add', 'todo-done', 'todo-trash']),
};

/** Group consecutive todo-add events that share the same hour into collapsible groups */
function buildDisplayItems(events: TimelineEvent[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    if (ev.type === 'todo-add') {
      // Collect consecutive todo-add events in the same hour
      const hourKey = getHourKey(ev.timestamp);
      const group: TimelineEvent[] = [ev];
      let j = i + 1;
      while (j < events.length && events[j].type === 'todo-add' && getHourKey(events[j].timestamp) === hourKey) {
        group.push(events[j]);
        j++;
      }
      if (group.length >= 2) {
        items.push({ kind: 'todo-group', events: group, hourKey });
      } else {
        items.push({ kind: 'event', event: ev });
      }
      i = j;
    } else {
      items.push({ kind: 'event', event: ev });
      i++;
    }
  }
  return items;
}

// ─── Collapsed TODO group component ───
const TodoGroupItem = memo(function TodoGroupItem({ group, lang }: { group: TimelineEvent[]; lang: Lang }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = EVENT_CONFIG['todo-add'];
  const firstTs = group[group.length - 1].timestamp; // earliest in group (sorted desc)
  const count = group.length;
  const label = tf('timelineTodoBatch', lang, count);

  return (
    <div>
      <div
        className="tl-event tl-event-clickable"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="tl-event-time">{formatTime(firstTs)}</div>
        <div className="tl-event-dot" style={{ background: cfg.border }} />
        <div className="tl-event-body">
          <span
            className="tl-event-badge"
            style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
          >
            {EVENT_ICON['todo-add']}
            {label}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ marginLeft: 52, paddingLeft: 16, borderLeft: '2px solid var(--border-divider)', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 8 }}>
          {group.map((ev) => (
            <div key={ev.id} style={{ fontSize: 13, color: 'var(--text-body)', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <CheckSquare size={12} style={{ color: 'var(--text-placeholder)', flexShrink: 0, marginTop: 3 }} />
              <span>{ev.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

function todayKey(): string {
  return formatDateKey(Date.now());
}

function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDateKey(date.getTime());
}

function dateKeyToInput(dateKey: string): string {
  return dateKey; // already YYYY-MM-DD
}

function inputToDateKey(input: string): string {
  return input; // already YYYY-MM-DD
}

export default function TimelineView({ logs, projects, todos, masterNotes, onBack, onOpenLog, onOpenProject, onOpenSummary, onNewLog, lang }: TimelineViewProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [noActivityDate, setNoActivityDate] = useState<string | null>(null);

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const allEvents = useMemo(
    () => buildEvents(logs, projects, todos, masterNotes, projectMap),
    [logs, projects, todos, masterNotes, projectMap],
  );

  // Apply filter
  const filteredEvents = useMemo(() => {
    const types = FILTER_TYPES[filter];
    return allEvents.filter((ev) => types.has(ev.type));
  }, [allEvents, filter]);

  // Group by date, then build display items with todo grouping
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    const order: string[] = [];
    for (const ev of filteredEvents) {
      const key = formatDateKey(ev.timestamp);
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(ev);
    }
    return order.map((key) => ({
      key,
      label: formatDateLabel(key, lang),
      items: buildDisplayItems(map.get(key)!),
    }));
  }, [filteredEvents, lang]);

  const dateKeys = useMemo(() => new Set(grouped.map((g) => g.key)), [grouped]);

  const scrollToDate = useCallback((dateKey: string) => {
    setNoActivityDate(null);
    const el = dayRefs.current.get(dateKey);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setJumpDate(dateKey);
    } else {
      // No activity on this date
      setNoActivityDate(dateKey);
      setJumpDate(dateKey);
    }
  }, []);

  const handlePrevDay = () => {
    const current = jumpDate || todayKey();
    scrollToDate(shiftDate(current, -1));
  };

  const handleNextDay = () => {
    const current = jumpDate || todayKey();
    scrollToDate(shiftDate(current, 1));
  };

  const handleDateInput = (value: string) => {
    if (value) scrollToDate(inputToDateKey(value));
  };

  const handleToday = () => {
    scrollToDate(todayKey());
  };

  // Clear noActivityDate after a timeout
  useEffect(() => {
    if (!noActivityDate) return;
    const timer = setTimeout(() => setNoActivityDate(null), 3000);
    return () => clearTimeout(timer);
  }, [noActivityDate]);

  const handleClick = (ev: TimelineEvent) => {
    if (ev.targetType === 'log' && ev.targetId) onOpenLog(ev.targetId);
    else if (ev.targetType === 'project' && ev.targetId) onOpenProject(ev.targetId);
    else if (ev.targetType === 'summary' && ev.targetId) onOpenSummary(ev.targetId);
  };

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t('timelineFilterAll', lang) },
    { key: 'handoff', label: 'Handoff' },
    { key: 'todo', label: 'TODO' },
    { key: 'worklog', label: 'Worklog' },
  ];

  const renderEvent = (ev: TimelineEvent) => {
    const cfg = EVENT_CONFIG[ev.type];
    const clickable = !!ev.targetId;
    return (
      <div
        key={ev.id}
        className={`tl-event${clickable ? ' tl-event-clickable' : ''}`}
        onClick={clickable ? () => handleClick(ev) : undefined}
      >
        <div className="tl-event-time">{formatTime(ev.timestamp)}</div>
        <div className="tl-event-dot" style={{ background: cfg.border }} />
        <div className="tl-event-body">
          <span
            className="tl-event-badge"
            style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
          >
            {EVENT_ICON[ev.type]}
            {cfg.label(lang)}
          </span>
          <span className="tl-event-title">{ev.title}</span>
          {ev.workloadLevel && (ev.type === 'log' || ev.type === 'handoff') && (
            <span
              style={{ fontSize: 11, marginLeft: 4 }}
              title={WORKLOAD_CONFIG[ev.workloadLevel].label(lang)}
            >
              {WORKLOAD_CONFIG[ev.workloadLevel].emoji}
            </span>
          )}
          {ev.projectName && ev.type !== 'project' && ev.type !== 'summary' && (
            <span className="tl-event-project">
              <FileText size={10} />
              {ev.projectName}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="workspace-content-wide">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <div>
          <h2>{t('timelineTitle', lang)}</h2>
          <p className="page-subtitle">{t('timelineDesc', lang)}</p>
        </div>
      </div>

      {/* Filter tabs + date nav */}
      <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="seg-control">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              className={`seg-control-btn${filter === opt.key ? ' active-worklog' : ''}`}
              onClick={() => setFilter(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date navigation */}
      <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="btn btn-ghost" onClick={handlePrevDay} style={{ padding: '4px 6px', minHeight: 28 }} title={t('timelinePrevDay', lang)}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Calendar size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="date"
            className="input"
            value={jumpDate ? dateKeyToInput(jumpDate) : dateKeyToInput(todayKey())}
            onChange={(e) => handleDateInput(e.target.value)}
            style={{ fontSize: 13, padding: '4px 8px 4px 28px', minHeight: 28, maxWidth: 160, width: 'auto' }}
          />
        </div>
        <button className="btn btn-ghost" onClick={handleNextDay} style={{ padding: '4px 6px', minHeight: 28 }} title={t('timelineNextDay', lang)}>
          <ChevronRight size={16} />
        </button>
        <button
          className="btn"
          onClick={handleToday}
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 28 }}
        >
          {t('timelineToday', lang)}
        </button>
        {jumpDate && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
            {formatDateLabel(jumpDate, lang)}
            {!dateKeys.has(jumpDate) && jumpDate === noActivityDate && (
              <span style={{ marginLeft: 8, color: 'var(--warning-text, #b45309)' }}>
                — {t('timelineNoActivity', lang)}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Activity heatmap */}
      <ActivityHeatmap logs={logs} lang={lang} onDateClick={scrollToDate} />

      {filteredEvents.length === 0 ? (
        <div className="empty-state">
          <EmptyTimeline />
          <p>{t('timelineEmpty', lang)}</p>
          <p className="page-subtitle">{t('timelineEmptyHint', lang)}</p>
          {onNewLog && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onNewLog}>
              {t('newLog', lang)}
            </button>
          )}
        </div>
      ) : (
        <div ref={containerRef} className="tl-container">
          {grouped.map((group) => (
            <div key={group.key} className="tl-day" ref={(el) => { if (el) dayRefs.current.set(group.key, el); else dayRefs.current.delete(group.key); }}>
              <div className="tl-day-label">{group.label}</div>
              <div className="tl-day-events">
                {group.items.map((item) => {
                  if (item.kind === 'todo-group') {
                    return <TodoGroupItem key={item.hourKey} group={item.events} lang={lang} />;
                  }
                  return renderEvent(item.event);
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
