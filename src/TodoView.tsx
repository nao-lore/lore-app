import { useState, useRef, useEffect, useCallback } from 'react';
import { usePersistedState } from './usePersistedState';
import { CheckSquare, Square, MoreHorizontal, MoreVertical, Star, Edit3, Trash2, Flag, Calendar, ExternalLink, Pin, Check, Undo2, Archive, ArchiveRestore, CheckCheck, GripVertical, AlertTriangle, Copy, Clock } from 'lucide-react';
import type { Todo, LogEntry } from './types';
import { loadTodos, loadArchivedTodos, updateTodo, addManualTodo, trashTodo, trashCompletedTodos, archiveTodo, unarchiveTodo, bulkUpdateTodos, bulkTrashTodos, reorderTodos, snoozeTodo } from './storage';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import DropdownMenu from './DropdownMenu';
import ConfirmDialog from './ConfirmDialog';
import { EmptyTodos } from './EmptyIllustrations';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


type SortKey = 'created' | 'title' | 'priority' | 'due';
type GroupKey = 'none' | 'date' | 'priority' | 'source';

const STALE_DAYS = 3;

function isStaleTodo(todo: Todo): boolean {
  if (todo.done) return false;
  const created = new Date(todo.createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= STALE_DAYS;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

import { formatDateGroup } from './utils/dateFormat';
import { playComplete } from './sounds';

function formatDateGroupTs(ts: number): string {
  return formatDateGroup(new Date(ts).toISOString());
}

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

function isDueToday(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate === today;
}

interface TodoViewProps {
  logs: LogEntry[];
  onBack: () => void;
  onOpenLog: (id: string) => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

// ─── Action Sheet ───
function TodoActionSheet({ todo, lang, logTitle, onClose, onAction }: {
  todo: Todo;
  lang: Lang;
  logTitle?: string;
  onClose: () => void;
  onAction: (action: string, value?: string) => void;
}) {
  const [subMenu, setSubMenu] = useState<'priority' | 'due' | 'snooze' | null>(null);
  const [dueValue, setDueValue] = useState(todo.dueDate || '');
  const [now] = useState(() => Math.floor(Date.now() / 60000) * 60000);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const priorityLabel = (p?: string) => {
    const labels: Record<string, string> = {
      high: t('todoPriorityHigh', lang),
      medium: t('todoPriorityMedium', lang),
      low: t('todoPriorityLow', lang),
    };
    return p ? labels[p] || p : t('todoPriorityNone', lang);
  };

  const priorityColor = (p: string) => {
    const colors: Record<string, string> = { high: 'var(--error-text, #ef4444)', medium: 'var(--warning-text, #f59e0b)', low: 'var(--text-muted, #6b7280)' };
    return colors[p] || 'var(--text-muted)';
  };

  if (subMenu === 'priority') {
    return (
      <div className="action-sheet-overlay" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet-handle" />
          <div className="action-sheet-header">
            <div className="action-sheet-header-title">{t('todoChangePriority', lang)}</div>
          </div>
          <div className="action-sheet-group">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                className="action-sheet-item"
                onClick={() => { onAction('priority', p); onClose(); }}
              >
                <span className="action-sheet-icon">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor(p) }} />
                </span>
                <span>{priorityLabel(p)}</span>
                {todo.priority === p && <Check size={16} style={{ marginLeft: 'auto', color: 'var(--accent-text)' }} />}
              </button>
            ))}
            <button
              className="action-sheet-item"
              onClick={() => { onAction('priority', ''); onClose(); }}
            >
              <span className="action-sheet-icon" style={{ color: 'var(--text-placeholder)' }}>—</span>
              <span>{t('todoPriorityNone', lang)}</span>
              {!todo.priority && <Check size={16} style={{ marginLeft: 'auto', color: 'var(--accent-text)' }} />}
            </button>
          </div>
          <button className="action-sheet-cancel" onClick={() => setSubMenu(null)}>
            {t('back', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (subMenu === 'due') {
    return (
      <div className="action-sheet-overlay" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet-handle" />
          <div className="action-sheet-header">
            <div className="action-sheet-header-title">{t('todoChangeDue', lang)}</div>
          </div>
          <div className="action-sheet-group" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="date"
                value={dueValue}
                onChange={(e) => setDueValue(e.target.value)}
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={() => { onAction('due', dueValue); onClose(); }}>
                {t('todoDueSet', lang)}
              </button>
            </div>
            {todo.dueDate && (
              <button
                className="btn"
                style={{ marginTop: 8, fontSize: 13, color: 'var(--error-text)' }}
                onClick={() => { onAction('due', ''); onClose(); }}
              >
                {t('todoDueRemove', lang)}
              </button>
            )}
          </div>
          <button className="action-sheet-cancel" onClick={() => setSubMenu(null)}>
            {t('back', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (subMenu === 'snooze') {
    const snoozeOptions = [
      { label: t('snooze1Day', lang), ms: 1 * 24 * 60 * 60 * 1000 },
      { label: t('snooze3Days', lang), ms: 3 * 24 * 60 * 60 * 1000 },
      { label: t('snooze1Week', lang), ms: 7 * 24 * 60 * 60 * 1000 },
    ];
    return (
      <div className="action-sheet-overlay" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet-handle" />
          <div className="action-sheet-header">
            <div className="action-sheet-header-title">{t('snooze', lang)}</div>
          </div>
          <div className="action-sheet-group">
            {snoozeOptions.map((opt) => (
              <button
                key={opt.ms}
                className="action-sheet-item"
                onClick={() => { onAction('snooze', String(Date.now() + opt.ms)); onClose(); }}
              >
                <span className="action-sheet-icon"><Clock size={18} /></span>
                <span>{opt.label}</span>
              </button>
            ))}
            {todo.snoozedUntil && (
              <button
                className="action-sheet-item"
                onClick={() => { onAction('snooze', '0'); onClose(); }}
              >
                <span className="action-sheet-icon"><Undo2 size={18} /></span>
                <span>{t('cancel', lang)}</span>
              </button>
            )}
          </div>
          <button className="action-sheet-cancel" onClick={() => setSubMenu(null)}>
            {t('back', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="action-sheet-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet-handle" />
        <div className="action-sheet-header">
          <div className="action-sheet-header-title">{todo.text}</div>
        </div>
        <div className="action-sheet-group">
          {/* Toggle done */}
          <button className="action-sheet-item" onClick={() => { onAction('toggle'); onClose(); }}>
            <span className="action-sheet-icon">
              {todo.done ? <Undo2 size={18} /> : <Check size={18} />}
            </span>
            <span>{todo.done ? t('todoMarkUndone', lang) : t('todoMarkDone', lang)}</span>
          </button>

          {/* Pin */}
          <button className="action-sheet-item" onClick={() => { onAction('pin'); onClose(); }}>
            <span className="action-sheet-icon">
              {todo.pinned ? <Pin size={18} /> : <Star size={18} />}
            </span>
            <span>{todo.pinned ? t('todoUnpin', lang) : t('todoPin', lang)}</span>
          </button>

          <div className="action-sheet-divider" />

          {/* Priority */}
          <button className="action-sheet-item" onClick={() => setSubMenu('priority')}>
            <span className="action-sheet-icon">
              <Flag size={18} />
            </span>
            <span>{t('todoChangePriority', lang)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {priorityLabel(todo.priority)}
            </span>
          </button>

          {/* Due date */}
          <button className="action-sheet-item" onClick={() => setSubMenu('due')}>
            <span className="action-sheet-icon">
              <Calendar size={18} />
            </span>
            <span>{t('todoChangeDue', lang)}</span>
            {todo.dueDate && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {todo.dueDate}
              </span>
            )}
          </button>

          {/* Snooze */}
          <button className="action-sheet-item" onClick={() => setSubMenu('snooze')}>
            <span className="action-sheet-icon">
              <Clock size={18} />
            </span>
            <span>{t('snooze', lang)}</span>
            {todo.snoozedUntil && todo.snoozedUntil > now && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {t('snoozed', lang)}
              </span>
            )}
          </button>

          <div className="action-sheet-divider" />

          {/* Edit */}
          <button className="action-sheet-item" onClick={() => { onAction('edit'); onClose(); }}>
            <span className="action-sheet-icon">
              <Edit3 size={18} />
            </span>
            <span>{t('todoEdit', lang)}</span>
          </button>

          {/* Archive / Unarchive */}
          <button className="action-sheet-item" onClick={() => { onAction('archive'); onClose(); }}>
            <span className="action-sheet-icon">
              {todo.archivedAt ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </span>
            <span>{todo.archivedAt ? t('todoUnarchive', lang) : t('todoArchive', lang)}</span>
          </button>

          {/* Open source log */}
          {todo.logId && logTitle && (
            <button className="action-sheet-item" onClick={() => { onAction('openLog'); onClose(); }}>
              <span className="action-sheet-icon">
                <ExternalLink size={18} />
              </span>
              <span>{t('todoOpenSourceLog', lang)}</span>
            </button>
          )}

          <div className="action-sheet-divider" />

          {/* Move to Trash */}
          <button className="action-sheet-item danger" onClick={() => { onAction('delete'); onClose(); }}>
            <span className="action-sheet-icon">
              <Trash2 size={18} />
            </span>
            <span>{t('moveToTrash', lang)}</span>
          </button>
        </div>

        <button className="action-sheet-cancel" onClick={onClose}>
          {t('cancel', lang)}
        </button>
      </div>
    </div>
  );
}

type TabKey = 'pending' | 'completed' | 'archived';

// ─── Sortable wrapper ───
function SortableTodoItem({ id, disabled, children }: { id: string; disabled: boolean; children: (props: { handleProps: Record<string, unknown>; style: React.CSSProperties }) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.15)' : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ handleProps: { ...attributes, ...listeners }, style })}
    </div>
  );
}


// ─── Main TodoView ───
export default function TodoView({ logs, onBack, onOpenLog, lang, showToast }: TodoViewProps) {
  const [todosVersion, setTodosVersion] = useState(0);
  void todosVersion;
  const todos = loadTodos();
  const archivedTodos = loadArchivedTodos();

  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('threadlog_todos_sort', 'created');
  const [groupKey, setGroupKey] = usePersistedState<GroupKey>('threadlog_todos_group', 'none');
  const [actionSheetTodo, setActionSheetTodo] = useState<Todo | null>(null);

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteCompleted, setConfirmDeleteCompleted] = useState(false);

  const [staleFilter, setStaleFilter] = useState(false);
  const [dueFilter, setDueFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('all');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const TODO_PAGE_SIZE = 50;
  const [todoVisibleCount, setTodoVisibleCount] = useState(TODO_PAGE_SIZE);

  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow on outside click
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

  // Add form state
  const [addOpen, setAddOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low' | ''>('');
  const [newDueDate, setNewDueDate] = useState('');
  const [todoError, setTodoError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setTodosVersion((v) => v + 1);

  const handleToggle = (id: string, done: boolean) => {
    updateTodo(id, { done: !done });
    refresh();
    if (!done) playComplete();
    showToast?.(!done ? t('todoMarkDone', lang) : t('todoMarkUndone', lang), 'success');
  };

  const handleAction = (todo: Todo, action: string, value?: string) => {
    switch (action) {
      case 'toggle':
        updateTodo(todo.id, { done: !todo.done });
        break;
      case 'pin':
        updateTodo(todo.id, { pinned: !todo.pinned });
        break;
      case 'priority':
        updateTodo(todo.id, { priority: (value as Todo['priority']) || undefined });
        break;
      case 'due':
        updateTodo(todo.id, { dueDate: value || undefined });
        break;
      case 'edit': {
        const editedText = prompt(t('todoEditPrompt', lang), todo.text);
        if (editedText && editedText.trim() && editedText.trim() !== todo.text) {
          updateTodo(todo.id, { text: editedText.trim() });
        }
        break;
      }
      case 'openLog':
        if (todo.logId) onOpenLog(todo.logId);
        return; // don't refresh
      case 'archive':
        if (todo.archivedAt) {
          unarchiveTodo(todo.id);
        } else {
          archiveTodo(todo.id);
        }
        break;
      case 'snooze': {
        const until = value ? Number(value) : 0;
        snoozeTodo(todo.id, until || 0);
        if (until > 0) {
          showToast?.(t('snoozed', lang), 'success');
        }
        break;
      }
      case 'delete':
        trashTodo(todo.id);
        showToast?.(t('moveToTrash', lang), 'success');
        break;
    }
    refresh();
  };

  const handleAdd = () => {
    if (!newText.trim()) {
      setTodoError(t('todoInputRequired', lang));
      return;
    }
    setTodoError('');
    addManualTodo(newText.trim(), {
      priority: newPriority || undefined,
      dueDate: newDueDate || undefined,
    });
    setNewText('');
    setNewPriority('');
    setNewDueDate('');
    refresh();
    showToast?.(t('todoAdd', lang), 'success');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleDeleteCompleted = () => {
    setOverflowOpen(false);
    if (completed.length === 0) return;
    setConfirmDeleteCompleted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Escape') {
      setAddOpen(false);
      setNewText('');
    }
  };

  const [now] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const isSnoozedNow = (td: Todo) => !!(td.snoozedUntil && td.snoozedUntil > now);
  const pending = todos.filter((td) => !td.done);
  const completed = todos.filter((td) => td.done);
  const staleTodos = pending.filter(isStaleTodo);
  const snoozedCount = pending.filter(isSnoozedNow).length;
  const basePending = showSnoozed ? pending : pending.filter((td) => !isSnoozedNow(td));
  const baseDisplayed = activeTab === 'archived' ? archivedTodos : activeTab === 'completed' ? completed : basePending;
  const afterStaleFilter = staleFilter && activeTab === 'pending' ? baseDisplayed.filter(isStaleTodo) : baseDisplayed;
  const displayed = activeTab === 'pending' && dueFilter !== 'all'
    ? afterStaleFilter.filter((td) => {
        if (dueFilter === 'today') return isDueToday(td.dueDate);
        if (dueFilter === 'overdue') return isOverdue(td.dueDate);
        if (dueFilter === 'week') {
          if (!td.dueDate) return false;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(today); endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
          const due = new Date(td.dueDate);
          return due >= today && due <= endOfWeek;
        }
        return true;
      })
    : afterStaleFilter;

  // Exit select mode when switching tabs
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSelectMode(false);
    setSelectedIds(new Set());
    setStaleFilter(false);
    setDueFilter('all');
    setTodoVisibleCount(TODO_PAGE_SIZE);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDone = () => {
    bulkUpdateTodos(Array.from(selectedIds), { done: true });
    setSelectedIds(new Set());
    setSelectMode(false);
    refresh();
  };

  const handleBulkDeleteConfirm = () => {
    bulkTrashTodos(Array.from(selectedIds));
    setConfirmBulkDelete(false);
    setSelectedIds(new Set());
    setSelectMode(false);
    refresh();
  };

  // Sort (pinned first, then by sort key)
  const sorted = [...displayed].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    switch (sortKey) {
      case 'title':
        return a.text.localeCompare(b.text);
      case 'priority': {
        const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
        const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
        return pa - pb || b.createdAt - a.createdAt;
      }
      case 'due': {
        const da = a.dueDate || '9999-12-31';
        const db = b.dueDate || '9999-12-31';
        return da.localeCompare(db) || b.createdAt - a.createdAt;
      }
      case 'created':
      default: {
        // Use manual sortOrder if both have it
        const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        return b.createdAt - a.createdAt;
      }
    }
  });

  // Group
  const logMap = new Map<string, LogEntry>();
  for (const log of logs) logMap.set(log.id, log);

  type GroupedEntry = { key: string; label: string; items: Todo[] };

  const buildGroups = (): GroupedEntry[] => {
    if (groupKey === 'none') {
      return [{ key: '_all', label: '', items: sorted }];
    }

    const map = new Map<string, { label: string; items: Todo[] }>();
    const order: string[] = [];

    for (const todo of sorted) {
      let key: string;
      let label: string;

      switch (groupKey) {
        case 'date': {
          const d = new Date(todo.createdAt);
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          label = formatDateGroupTs(todo.createdAt);
          break;
        }
        case 'priority': {
          key = todo.priority || 'none';
          const pLabels: Record<string, string> = {
            high: t('todoPriorityHigh', lang),
            medium: t('todoPriorityMedium', lang),
            low: t('todoPriorityLow', lang),
            none: t('todoPriorityNone', lang),
          };
          label = pLabels[key] || key;
          break;
        }
        case 'source': {
          key = todo.logId || '_manual';
          if (todo.logId) {
            const log = logMap.get(todo.logId);
            label = log ? log.title : todo.logId;
          } else {
            label = t('todoManual', lang);
          }
          break;
        }
        default:
          key = '_all';
          label = '';
      }

      if (!map.has(key)) {
        map.set(key, { label, items: [] });
        order.push(key);
      }
      map.get(key)!.items.push(todo);
    }

    if (groupKey === 'priority') {
      const pOrder = ['high', 'medium', 'low', 'none'];
      return pOrder
        .filter((k) => map.has(k))
        .map((k) => ({ key: k, ...map.get(k)! }));
    }

    return order.map((k) => ({ key: k, ...map.get(k)! }));
  };

  const groups = buildGroups();

  // Drag-and-drop: only when pending tab, no grouping, sort=created, not in select mode
  const dragEnabled = activeTab === 'pending' && groupKey === 'none' && sortKey === 'created' && !selectMode;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((t) => t.id === active.id);
    const newIndex = sorted.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorderTodos(reordered.map((t) => t.id));
    refresh();
  };

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

  const priorityStyles = (p?: string): { bg: string; hoverBg: string; border: string } => {
    switch (p) {
      case 'high':
        return { bg: 'var(--tint-priority-high)', hoverBg: 'var(--tint-priority-high)', border: 'var(--line-priority-high)' };
      case 'medium':
        return { bg: 'var(--tint-priority-medium)', hoverBg: 'var(--tint-priority-medium)', border: 'var(--line-priority-medium)' };
      case 'low':
        return { bg: 'transparent', hoverBg: 'var(--sidebar-hover)', border: 'var(--line-priority-low)' };
      default:
        return { bg: 'transparent', hoverBg: 'var(--sidebar-hover)', border: 'transparent' };
    }
  };

  const renderTodoItem = (todo: Todo, showSource: boolean, handleProps?: Record<string, unknown>) => {
    const logTitle = todo.logId ? logMap.get(todo.logId)?.title : undefined;
    const ps = priorityStyles(todo.priority);
    const isSelected = selectedIds.has(todo.id);
    return (
      <div
        key={todo.id}
        className="todo-item"
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: selectMode && isSelected ? 'var(--sidebar-active)' : ps.bg,
          borderLeft: ps.border !== 'transparent' ? `3px solid ${ps.border}` : '3px solid transparent',
          transition: 'background 0.12s',
          cursor: selectMode ? 'pointer' : undefined,
        }}
        onMouseEnter={(e) => { if (!selectMode) e.currentTarget.style.background = ps.hoverBg; }}
        onMouseLeave={(e) => { if (!selectMode) e.currentTarget.style.background = ps.bg; }}
        onClick={selectMode ? () => toggleSelect(todo.id) : undefined}
      >
        {/* Drag handle */}
        {dragEnabled && handleProps && (
          <div {...handleProps} style={{ flexShrink: 0, marginTop: 2, cursor: todo.done ? 'default' : 'grab', color: 'var(--text-placeholder)', touchAction: 'none', opacity: todo.done ? 0.3 : 1, pointerEvents: todo.done ? 'none' : 'auto' }}>
            <GripVertical size={16} />
          </div>
        )}
        {/* Select checkbox in bulk mode */}
        {selectMode ? (
          <div style={{ flexShrink: 0, marginTop: 1, padding: '2px' }}>
            {isSelected
              ? <CheckSquare size={17} style={{ color: 'var(--accent)' }} />
              : <Square size={17} style={{ color: 'var(--text-placeholder)' }} />
            }
          </div>
        ) : (
          /* Checkbox — only this toggles done */
          <div
            className="check-pop-target"
            onClick={() => handleToggle(todo.id, todo.done)}
            style={{ flexShrink: 0, marginTop: 1, cursor: 'pointer', padding: '2px', transition: 'transform 0.15s ease' }}
          >
            {todo.done
              ? <CheckSquare size={17} style={{ color: 'var(--success-text)' }} />
              : <Square size={17} style={{ color: 'var(--text-placeholder)' }} />
            }
          </div>
        )}

        {/* Pin indicator */}
        {todo.pinned && (
          <Star size={10} fill="var(--warning-dot)" style={{ color: 'var(--warning-dot)', flexShrink: 0, marginTop: 5 }} />
        )}

        {/* Text + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: todo.done || todo.archivedAt ? 'var(--text-subtle)' : 'var(--text-body)',
            textDecoration: todo.done ? 'line-through' : 'none',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}>
            {todo.text}
          </span>
          <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {todo.dueDate && (
              <span style={{
                color: isOverdue(todo.dueDate) && !todo.done ? 'var(--error-text)' : isDueToday(todo.dueDate) ? 'var(--accent-text)' : undefined,
                fontWeight: isOverdue(todo.dueDate) && !todo.done ? 500 : undefined,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {isOverdue(todo.dueDate) && !todo.done ? t('todoOverdue', lang) + ': ' : isDueToday(todo.dueDate) ? t('todoToday', lang) + ': ' : t('todoDueDate', lang) + ': '}
                {todo.dueDate}
                {isOverdue(todo.dueDate) && !todo.done && (
                  <span style={{
                    color: 'var(--error-text, #ef4444)',
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '0px 5px',
                    borderRadius: 3,
                    lineHeight: '16px',
                  }}>
                    {lang === 'ja' ? '期限切れ' : 'Overdue'}
                  </span>
                )}
              </span>
            )}
            {todo.snoozedUntil && todo.snoozedUntil > now && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                background: 'var(--tint-priority-medium, #fef3c7)', color: 'var(--warning-text, #b45309)',
              }}>
                <Clock size={10} />
                {t('snoozed', lang)}
              </span>
            )}
            {showSource && todo.logId && logTitle && (
              <button
                className="btn-link"
                style={{ fontSize: 11 }}
                onClick={(e) => { e.stopPropagation(); onOpenLog(todo.logId); }}
              >
                {logTitle}
              </button>
            )}
            {showSource && !todo.logId && (
              <span>{t('todoManual', lang)}</span>
            )}
          </div>
        </div>

        {/* Three-dot menu (hidden in select mode) */}
        {!selectMode && (
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            <button
              className="action-menu-btn"
              aria-label={t('ariaMenu', lang)}
              onClick={() => setActionSheetTodo(todo)}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const showSourcePerItem = groupKey !== 'source';

  return (
    <div className="workspace-content-wide">
      <div className="page-header page-header-sticky">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2>{t('todos', lang)}</h2>
            <p className="page-subtitle">{pending.length} {t('todoPending', lang)} · {completed.length} {t('todoCompleted', lang)}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!selectMode && (
              <>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 13, padding: '5px 14px', minHeight: 30 }}
                  onClick={() => { setAddOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                >
                  {t('todoAdd', lang)}
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 13, padding: '5px 14px', minHeight: 30, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}
                  disabled={displayed.length === 0}
                >
                  <CheckCheck size={14} /> {t('todoBulkSelect', lang)}
                </button>
              </>
            )}
            <div ref={overflowRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost"
                style={{ padding: '5px 6px', minHeight: 30 }}
                onClick={() => setOverflowOpen(!overflowOpen)}
              >
                <MoreVertical size={18} />
              </button>
              {overflowOpen && (
                <div className="dropdown-menu" style={{ minWidth: 180 }}>
                  <button
                    className="mn-export-item"
                    onClick={handleDeleteCompleted}
                    disabled={completed.length === 0}
                    style={completed.length === 0 ? { opacity: 0.4, cursor: 'default' } : { color: 'var(--error-text)' }}
                  >
                    <Trash2 size={14} />
                    <span>{t('todoDeleteCompleted', lang)}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Stale TODO banner */}
      {staleTodos.length > 0 && activeTab === 'pending' && !staleFilter && (
        <div
          className="stale-todo-banner"
          onClick={() => setStaleFilter(true)}
          style={{ cursor: 'pointer' }}
        >
          <AlertTriangle size={14} />
          <span>{tf('staleTodoBanner', lang, staleTodos.length)}</span>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '8px 14px' }}>
          {/* Left: checkbox + toggle + count */}
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, userSelect: 'none' }}
            onClick={() => {
              if (selectedIds.size === sorted.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(sorted.map((td) => td.id)));
              }
            }}
          >
            {selectedIds.size === sorted.length ? <CheckSquare size={14} /> : <Square size={14} />}
            <span>{selectedIds.size === sorted.length ? t('todoBulkDeselectAll', lang) : t('todoBulkSelectAll', lang)}</span>
          </label>
          <span className="meta" style={{ fontSize: 12 }}>
            {tf('todoSelectedCount', lang, selectedIds.size, sorted.length)}
          </span>
          <div style={{ flex: 1 }} />
          {/* Right: action buttons */}
          {selectedIds.size > 0 && (
            <button
              className="btn"
              style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={async () => {
                const selected = sorted.filter((td) => selectedIds.has(td.id));
                const text = selected.map((td) => td.text).join('\n');
                try {
                  await navigator.clipboard.writeText(text);
                  showToast?.(tf('todoBulkCopied', lang, selected.length), 'success');
                } catch {
                  showToast?.(t('copyFailed', lang), 'error');
                }
              }}
            >
              <Copy size={13} /> {t('todoBulkCopy', lang)}
            </button>
          )}
          {selectedIds.size > 0 && activeTab === 'pending' && (
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={handleBulkDone}
            >
              <Check size={13} /> {t('todoBulkDone', lang)}
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              className="btn"
              style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, color: 'var(--error-text)', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 size={13} /> {t('todoBulkDelete', lang)}
            </button>
          )}
          <button
            className="btn"
            style={{ fontSize: 12, padding: '4px 10px', minHeight: 26 }}
            onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          >
            {t('todoBulkCancel', lang)}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="seg-control">
          <button
            className={`seg-control-btn${activeTab === 'pending' ? ' active-worklog' : ''}`}
            onClick={() => handleTabChange('pending')}
          >
            {t('todoPending', lang)} ({pending.length})
          </button>
          <button
            className={`seg-control-btn${activeTab === 'completed' ? ' active-worklog' : ''}`}
            onClick={() => handleTabChange('completed')}
            disabled={completed.length === 0}
            style={completed.length === 0 ? { opacity: 0.4, cursor: 'default' } : undefined}
          >
            {t('todoCompleted', lang)} ({completed.length})
          </button>
          <button
            className={`seg-control-btn${activeTab === 'archived' ? ' active-worklog' : ''}`}
            onClick={() => handleTabChange('archived')}
            disabled={archivedTodos.length === 0}
            style={archivedTodos.length === 0 ? { opacity: 0.4, cursor: 'default' } : undefined}
          >
            {t('todoArchived', lang)} ({archivedTodos.length})
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <DropdownMenu
          label={t('todoSortLabel', lang)}
          value={sortKey}
          options={sortOptions}
          onChange={(k) => setSortKey(k as SortKey)}
        />
        <DropdownMenu
          label={t('todoGroupLabel', lang)}
          value={groupKey}
          options={groupOptions}
          onChange={(k) => setGroupKey(k as GroupKey)}
        />
        {activeTab === 'pending' && staleTodos.length > 0 && (
          <button
            className={`btn btn-sm${staleFilter ? ' btn-active' : ''}`}
            style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setStaleFilter(!staleFilter)}
          >
            <AlertTriangle size={12} />
            {t('todoFilterStale', lang)}
          </button>
        )}
      </div>

      {/* Due date filter */}
      {activeTab === 'pending' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Calendar size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div className="seg-control" style={{ fontSize: 11 }}>
            {(['all', 'today', 'week', 'overdue'] as const).map((key) => (
              <button
                key={key}
                className={`seg-control-btn${dueFilter === key ? ' active-worklog' : ''}`}
                style={{ padding: '2px 8px', minHeight: 22, fontSize: 11 }}
                onClick={() => setDueFilter(key)}
              >
                {key === 'all' ? t('todoDueAll', lang) : key === 'today' ? t('todoDueToday', lang) : key === 'week' ? t('todoDueThisWeek', lang) : t('todoDueOverdue', lang)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress ring summary bar */}
      {activeTab === 'pending' && (() => {
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
                <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} />
                {t('showSnoozed', lang)} ({snoozedCount})
              </label>
            )}
          </div>
        );
      })()}

      {/* Stale filter indicator */}
      {staleFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--warning-text, #b45309)' }}>
          <AlertTriangle size={12} />
          <span>{t('todoFilterStale', lang)}: {staleTodos.length}</span>
          <button
            className="btn"
            style={{ fontSize: 11, padding: '1px 8px', minHeight: 20, lineHeight: 1 }}
            onClick={() => setStaleFilter(false)}
          >
            ×
          </button>
        </div>
      )}

      {/* Add TODO form */}
      {addOpen && (
        <div className="content-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              className="input"
              type="text"
              value={newText}
              onChange={(e) => { setNewText(e.target.value); setTodoError(''); }}
              onBlur={() => { if (addOpen && newText.trim() === '') setTodoError(t('todoInputRequired', lang)); }}
              onKeyDown={handleKeyDown}
              placeholder={t('todoAddPlaceholder', lang)}
              maxLength={200}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleAdd} disabled={!newText.trim()} style={{ flexShrink: 0 }}>
              {t('todoAddBtn', lang)}
            </button>
            <button className="btn" onClick={() => { setAddOpen(false); setNewText(''); setTodoError(''); }} style={{ flexShrink: 0 }}>
              ×
            </button>
          </div>
          {todoError && (
            <p style={{ color: 'var(--error-text)', fontSize: 12, margin: '4px 0 0' }}>{todoError}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              {t('todoSortPriority', lang)}:
              <select
                className="input input-sm"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as '' | 'high' | 'medium' | 'low')}
                style={{ fontSize: 12, padding: '2px 6px', minHeight: 24 }}
              >
                <option value="">{t('todoPriorityNone', lang)}</option>
                <option value="high">{t('todoPriorityHigh', lang)}</option>
                <option value="medium">{t('todoPriorityMedium', lang)}</option>
                <option value="low">{t('todoPriorityLow', lang)}</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              {t('todoDueDate', lang)}:
              <input
                className="input input-sm"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                style={{ fontSize: 12, padding: '2px 6px', minHeight: 24 }}
              />
            </label>
          </div>
        </div>
      )}

      {/* TODO list */}
      {sorted.length === 0 && !addOpen ? (
        <div className="empty-state">
          {activeTab !== 'archived' && <EmptyTodos />}
          {activeTab === 'archived' && <div className="empty-state-icon">{'\u{1F4E6}'}</div>}
          <p>{activeTab === 'archived' ? t('todoNoArchived', lang) : t('noTodos', lang)}</p>
          {activeTab === 'pending' && <p className="page-subtitle">{t('noTodosDesc', lang)}</p>}
          {activeTab === 'archived' && <p className="page-subtitle">{t('todoNoArchivedDesc', lang)}</p>}
          {activeTab === 'pending' && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => { setAddOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            >
              {t('todoAdd', lang)}
            </button>
          )}
        </div>
      ) : groupKey === 'none' ? (
        <>
          <div className="content-card">
            {dragEnabled ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sorted.slice(0, todoVisibleCount).map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {sorted.slice(0, todoVisibleCount).map((todo) => (
                      <SortableTodoItem key={todo.id} id={todo.id} disabled={false}>
                        {({ handleProps }) => renderTodoItem(todo, true, handleProps)}
                      </SortableTodoItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {sorted.slice(0, todoVisibleCount).map((todo) => renderTodoItem(todo, true))}
              </div>
            )}
          </div>
          {sorted.length > todoVisibleCount && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <button className="btn" onClick={() => setTodoVisibleCount((v) => v + TODO_PAGE_SIZE)} style={{ fontSize: 13 }}>
                {tf('loadMore', lang, sorted.length - todoVisibleCount)}
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((group) => (
            <div key={group.key} className="content-card">
              {group.label && (
                <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border-divider)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {group.label}
                  </span>
                  <span className="meta" style={{ marginLeft: 8, fontSize: 11 }}>
                    {group.items.length}
                  </span>
                  {groupKey === 'source' && group.key !== '_manual' && (() => {
                    const log = logMap.get(group.key);
                    return log ? (
                      <button
                        className="btn-link"
                        style={{ fontSize: 11, marginLeft: 8 }}
                        onClick={() => onOpenLog(group.key)}
                      >
                        {t('todoFromLog', lang)} →
                      </button>
                    ) : null;
                  })()}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.items.map((todo) => renderTodoItem(todo, showSourcePerItem))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Sheet */}
      {actionSheetTodo && (
        <TodoActionSheet
          todo={actionSheetTodo}
          lang={lang}
          logTitle={actionSheetTodo.logId ? logMap.get(actionSheetTodo.logId)?.title : undefined}
          onClose={() => setActionSheetTodo(null)}
          onAction={(action, value) => handleAction(actionSheetTodo, action, value)}
        />
      )}

      {/* Bulk delete confirm */}
      {confirmBulkDelete && (
        <ConfirmDialog
          title={tf('todoBulkDeleteConfirm', lang, selectedIds.size)}
          description={t('todoBulkDeleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}

      {/* Delete completed confirm */}
      {confirmDeleteCompleted && (
        <ConfirmDialog
          title={t('todoDeleteCompletedConfirm', lang)}
          description={t('todoBulkDeleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { trashCompletedTodos(); setConfirmDeleteCompleted(false); refresh(); showToast?.(t('todoDeleteCompleted', lang), 'success'); }}
          onCancel={() => setConfirmDeleteCompleted(false)}
        />
      )}
    </div>
  );
}
