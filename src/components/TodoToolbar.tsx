import { useState, useRef, useEffect, memo } from 'react';
import { CheckSquare, Square, MoreVertical, Trash2, Check, CheckCheck, AlertTriangle, Copy, Calendar } from 'lucide-react';
import type { Todo } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import DropdownMenu from '../DropdownMenu';
import { isOverdue, isDueToday } from './TodoItem';

export type SortKey = 'created' | 'title' | 'priority' | 'due';
export type GroupKey = 'none' | 'date' | 'priority' | 'source';
export type TabKey = 'pending' | 'completed' | 'archived';

// ─── Tab bar (pending/completed/archived) ───
interface TodoTabsProps {
  activeTab: TabKey;
  pendingCount: number;
  completedCount: number;
  archivedCount: number;
  lang: Lang;
  sortKey: SortKey;
  onSortKeyChange: (v: SortKey) => void;
  groupKey: GroupKey;
  onGroupKeyChange: (v: GroupKey) => void;
  staleTodos: Todo[];
  staleFilter: boolean;
  onStaleFilterChange: (v: boolean) => void;
  onTabChange: (tab: TabKey) => void;
}

export const TodoTabs = memo(function TodoTabs({
  activeTab, pendingCount, completedCount, archivedCount, lang,
  sortKey, onSortKeyChange, groupKey, onGroupKeyChange,
  staleTodos, staleFilter, onStaleFilterChange, onTabChange,
}: TodoTabsProps) {
  const sortOptions = [
    { key: 'created', label: t('todoSortCreated', lang) },
    { key: 'title', label: t('todoSortTitle', lang) },
    { key: 'priority', label: t('todoSortPriority', lang) },
    { key: 'due', label: t('todoSortDue', lang) },
  ];
  const groupOptions = [
    { key: 'none', label: t('todoGroupNone', lang) },
    { key: 'date', label: t('todoGroupDate', lang) },
    { key: 'priority', label: t('todoGroupPriority', lang) },
    { key: 'source', label: t('todoGroupSource', lang) },
  ];

  return (
    <div className="content-card flex-row flex-wrap mb-xl" style={{ gap: 10 }}>
      <div className="seg-control">
        <button
          className={`seg-control-btn${activeTab === 'pending' ? ' active-worklog' : ''}`}
          onClick={() => onTabChange('pending')}
        >
          {t('todoPending', lang)} ({pendingCount})
        </button>
        <button
          className={`seg-control-btn${activeTab === 'completed' ? ' active-worklog' : ''}`}
          onClick={() => onTabChange('completed')}
          disabled={completedCount === 0}
          style={completedCount === 0 ? { opacity: 0.4, cursor: 'default' } : undefined}
        >
          {t('todoCompleted', lang)} ({completedCount})
        </button>
        <button
          className={`seg-control-btn${activeTab === 'archived' ? ' active-worklog' : ''}`}
          onClick={() => onTabChange('archived')}
          disabled={archivedCount === 0}
          style={archivedCount === 0 ? { opacity: 0.4, cursor: 'default' } : undefined}
        >
          {t('todoArchived', lang)} ({archivedCount})
        </button>
      </div>
      <div className="flex-1" />
      <DropdownMenu
        label={t('todoSortLabel', lang)}
        value={sortKey}
        options={sortOptions}
        onChange={(k) => onSortKeyChange(k as SortKey)}
      />
      <DropdownMenu
        label={t('todoGroupLabel', lang)}
        value={groupKey}
        options={groupOptions}
        onChange={(k) => onGroupKeyChange(k as GroupKey)}
      />
      {activeTab === 'pending' && staleTodos.length > 0 && (
        <button
          className={`btn btn-sm btn-toolbar${staleFilter ? ' btn-active' : ''}`}
          onClick={() => onStaleFilterChange(!staleFilter)}
        >
          <AlertTriangle size={12} />
          {t('todoFilterStale', lang)}
        </button>
      )}
    </div>
  );
});

// ─── Due date filter bar ───
interface DueFilterBarProps {
  lang: Lang;
  dueFilter: 'all' | 'today' | 'week' | 'overdue';
  onDueFilterChange: (v: 'all' | 'today' | 'week' | 'overdue') => void;
}

export const DueFilterBar = memo(function DueFilterBar({ lang, dueFilter, onDueFilterChange }: DueFilterBarProps) {
  return (
    <div className="flex-row mb-md" style={{ gap: 6 }}>
      <Calendar size={12} className="text-muted shrink-0" />
      <div className="seg-control" style={{ fontSize: 11 }}>
        {(['all', 'today', 'week', 'overdue'] as const).map((key) => (
          <button
            key={key}
            className={`seg-control-btn due-filter-btn${dueFilter === key ? ' active-worklog' : ''}`}
            onClick={() => onDueFilterChange(key)}
          >
            {key === 'all' ? t('todoDueAll', lang) : key === 'today' ? t('todoDueToday', lang) : key === 'week' ? t('todoDueThisWeek', lang) : t('todoDueOverdue', lang)}
          </button>
        ))}
      </div>
    </div>
  );
});

// ─── Progress ring summary ───
interface ProgressSummaryProps {
  lang: Lang;
  todos: Todo[];
  pending: Todo[];
  completed: Todo[];
  snoozedCount: number;
  showSnoozed: boolean;
  onShowSnoozedChange: (v: boolean) => void;
}

export const ProgressSummary = memo(function ProgressSummary({ lang, todos, pending, completed, snoozedCount, showSnoozed, onShowSnoozedChange }: ProgressSummaryProps) {
  const total = todos.length;
  const doneCount = completed.length;
  const overdueCount = pending.filter((td) => isOverdue(td.dueDate) && !td.done).length;
  const dueTodayCount = pending.filter((td) => isDueToday(td.dueDate)).length;
  const radius = 20, circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? doneCount / total : 0;

  return (
    <div className="progress-summary">
      <svg width="50" height="50" className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="25" cy="25" r={radius} fill="none" stroke="var(--border-default)" strokeWidth="4" />
        <circle cx="25" cy="25" r={radius} fill="none" stroke="var(--success-text, #22c55e)" strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className="progress-label">
        {doneCount}/{total} {t('todoProgress', lang)}
      </span>
      {overdueCount > 0 && (
        <span className="progress-overdue">
          {overdueCount} {t('todoOverdue2', lang)}
        </span>
      )}
      {dueTodayCount > 0 && (
        <span className="progress-today">
          {dueTodayCount} {t('todoDueToday2', lang)}
        </span>
      )}
      <div className="flex-1" />
      {snoozedCount > 0 && (
        <label className="snoozed-label">
          <input type="checkbox" checked={showSnoozed} onChange={(e) => onShowSnoozedChange(e.target.checked)} />
          {t('showSnoozed', lang)} ({snoozedCount})
        </label>
      )}
    </div>
  );
});

// ─── Bulk action bar ───
interface BulkActionBarProps {
  lang: Lang;
  selectMode: boolean;
  selectedIds: Set<string>;
  sorted: Todo[];
  activeTab: TabKey;
  onSelectAll: () => void;
  onBulkDone: () => void;
  onBulkDelete: () => void;
  onBulkCopy: () => void;
  onCancel: () => void;
}

export const BulkActionBar = memo(function BulkActionBar({
  lang, selectMode, selectedIds, sorted, activeTab,
  onSelectAll, onBulkDone, onBulkDelete, onBulkCopy, onCancel,
}: BulkActionBarProps) {
  if (!selectMode) return null;

  return (
    <div className="content-card flex-row flex-wrap mb-md" style={{ padding: '8px 14px' }}>
      <label
        className="flex-row cursor-pointer select-none"
        style={{ gap: 6, fontSize: 12 }}
        onClick={onSelectAll}
      >
        {selectedIds.size === sorted.length ? <CheckSquare size={14} /> : <Square size={14} />}
        <span>{selectedIds.size === sorted.length ? t('todoBulkDeselectAll', lang) : t('todoBulkSelectAll', lang)}</span>
      </label>
      <span className="meta text-sm">
        {tf('todoSelectedCount', lang, selectedIds.size, sorted.length)}
      </span>
      <div className="flex-1" />
      {selectedIds.size > 0 && (
        <button className="btn btn-toolbar" onClick={onBulkCopy}>
          <Copy size={13} /> {t('todoBulkCopy', lang)}
        </button>
      )}
      {selectedIds.size > 0 && activeTab === 'pending' && (
        <button className="btn btn-primary btn-toolbar" onClick={onBulkDone}>
          <Check size={13} /> {t('todoBulkDone', lang)}
        </button>
      )}
      {selectedIds.size > 0 && (
        <button className="btn btn-toolbar text-error" onClick={onBulkDelete}>
          <Trash2 size={13} /> {t('todoBulkDelete', lang)}
        </button>
      )}
      <button className="btn btn-toolbar" onClick={onCancel}>
        {t('todoBulkCancel', lang)}
      </button>
    </div>
  );
});

// ─── Header actions (add, bulk select, overflow menu) ───
interface TodoHeaderActionsProps {
  lang: Lang;
  selectMode: boolean;
  displayedCount: number;
  completedCount: number;
  onAdd: () => void;
  onStartSelect: () => void;
  onDeleteCompleted: () => void;
}

export const TodoHeaderActions = memo(function TodoHeaderActions({ lang, selectMode, displayedCount, completedCount, onAdd, onStartSelect, onDeleteCompleted }: TodoHeaderActionsProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && e.target instanceof Node && !overflowRef.current.contains(e.target)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  return (
    <div className="flex-row" style={{ gap: 6 }}>
      {!selectMode && (
        <>
          <button className="btn btn-primary btn-add" onClick={onAdd}>
            {t('todoAdd', lang)}
          </button>
          <button
            className="btn btn-add-flex"
            onClick={onStartSelect}
            disabled={displayedCount === 0}
          >
            <CheckCheck size={14} /> {t('todoBulkSelect', lang)}
          </button>
        </>
      )}
      <div ref={overflowRef} className="relative">
        <button
          className="btn btn-ghost"
          style={{ padding: '5px 6px', minHeight: 44 }}
          onClick={() => setOverflowOpen(!overflowOpen)}
        >
          <MoreVertical size={18} />
        </button>
        {overflowOpen && (
          <div className="dropdown-menu" style={{ minWidth: 180 }}>
            <button
              className="mn-export-item"
              onClick={() => { setOverflowOpen(false); onDeleteCompleted(); }}
              disabled={completedCount === 0}
              style={completedCount === 0 ? { opacity: 0.4, cursor: 'default' } : { color: 'var(--error-text)' }}
            >
              <Trash2 size={14} />
              <span>{t('todoDeleteCompleted', lang)}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
