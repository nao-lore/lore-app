import { useState, useRef, useEffect } from 'react';
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

export function TodoTabs({
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
    <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
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
      <div style={{ flex: 1 }} />
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
          className={`btn btn-sm${staleFilter ? ' btn-active' : ''}`}
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => onStaleFilterChange(!staleFilter)}
        >
          <AlertTriangle size={12} />
          {t('todoFilterStale', lang)}
        </button>
      )}
    </div>
  );
}

// ─── Due date filter bar ───
interface DueFilterBarProps {
  lang: Lang;
  dueFilter: 'all' | 'today' | 'week' | 'overdue';
  onDueFilterChange: (v: 'all' | 'today' | 'week' | 'overdue') => void;
}

export function DueFilterBar({ lang, dueFilter, onDueFilterChange }: DueFilterBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <Calendar size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <div className="seg-control" style={{ fontSize: 11 }}>
        {(['all', 'today', 'week', 'overdue'] as const).map((key) => (
          <button
            key={key}
            className={`seg-control-btn${dueFilter === key ? ' active-worklog' : ''}`}
            style={{ padding: '2px 8px', minHeight: 22, fontSize: 11 }}
            onClick={() => onDueFilterChange(key)}
          >
            {key === 'all' ? t('todoDueAll', lang) : key === 'today' ? t('todoDueToday', lang) : key === 'week' ? t('todoDueThisWeek', lang) : t('todoDueOverdue', lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

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

export function ProgressSummary({ lang, todos, pending, completed, snoozedCount, showSnoozed, onShowSnoozedChange }: ProgressSummaryProps) {
  const total = todos.length;
  const doneCount = completed.length;
  const overdueCount = pending.filter((td) => isOverdue(td.dueDate) && !td.done).length;
  const dueTodayCount = pending.filter((td) => isDueToday(td.dueDate)).length;
  const radius = 20, circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? doneCount / total : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, padding: '8px 14px', background: 'var(--bg-card, var(--sidebar-bg))', borderRadius: 8, border: '1px solid var(--border-default)' }}>
      <svg width="50" height="50" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        <circle cx="25" cy="25" r={radius} fill="none" stroke="var(--border-default)" strokeWidth="4" />
        <circle cx="25" cy="25" r={radius} fill="none" stroke="var(--success-text, #22c55e)" strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span style={{ fontSize: 14, fontWeight: 600 }}>
        {doneCount}/{total} {t('todoProgress', lang)}
      </span>
      {overdueCount > 0 && (
        <span style={{ fontSize: 12, color: 'var(--error-text, #ef4444)', fontWeight: 500 }}>
          {overdueCount} {t('todoOverdue2', lang)}
        </span>
      )}
      {dueTodayCount > 0 && (
        <span style={{ fontSize: 12, color: 'var(--warning-text, #f59e0b)', fontWeight: 500 }}>
          {dueTodayCount} {t('todoDueToday2', lang)}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {snoozedCount > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showSnoozed} onChange={(e) => onShowSnoozedChange(e.target.checked)} />
          {t('showSnoozed', lang)} ({snoozedCount})
        </label>
      )}
    </div>
  );
}

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

export function BulkActionBar({
  lang, selectMode, selectedIds, sorted, activeTab,
  onSelectAll, onBulkDone, onBulkDelete, onBulkCopy, onCancel,
}: BulkActionBarProps) {
  if (!selectMode) return null;

  return (
    <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '8px 14px' }}>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, userSelect: 'none' }}
        onClick={onSelectAll}
      >
        {selectedIds.size === sorted.length ? <CheckSquare size={14} /> : <Square size={14} />}
        <span>{selectedIds.size === sorted.length ? t('todoBulkDeselectAll', lang) : t('todoBulkSelectAll', lang)}</span>
      </label>
      <span className="meta" style={{ fontSize: 12 }}>
        {tf('todoSelectedCount', lang, selectedIds.size, sorted.length)}
      </span>
      <div style={{ flex: 1 }} />
      {selectedIds.size > 0 && (
        <button
          className="btn"
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={onBulkCopy}
        >
          <Copy size={13} /> {t('todoBulkCopy', lang)}
        </button>
      )}
      {selectedIds.size > 0 && activeTab === 'pending' && (
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={onBulkDone}
        >
          <Check size={13} /> {t('todoBulkDone', lang)}
        </button>
      )}
      {selectedIds.size > 0 && (
        <button
          className="btn"
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, color: 'var(--error-text)', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={onBulkDelete}
        >
          <Trash2 size={13} /> {t('todoBulkDelete', lang)}
        </button>
      )}
      <button
        className="btn"
        style={{ fontSize: 12, padding: '4px 10px', minHeight: 26 }}
        onClick={onCancel}
      >
        {t('todoBulkCancel', lang)}
      </button>
    </div>
  );
}

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

export function TodoHeaderActions({ lang, selectMode, displayedCount, completedCount, onAdd, onStartSelect, onDeleteCompleted }: TodoHeaderActionsProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {!selectMode && (
        <>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13, padding: '5px 14px', minHeight: 44 }}
            onClick={onAdd}
          >
            {t('todoAdd', lang)}
          </button>
          <button
            className="btn"
            style={{ fontSize: 13, padding: '5px 14px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={onStartSelect}
            disabled={displayedCount === 0}
          >
            <CheckCheck size={14} /> {t('todoBulkSelect', lang)}
          </button>
        </>
      )}
      <div ref={overflowRef} style={{ position: 'relative' }}>
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
}
