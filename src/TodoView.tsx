import { useState, useRef, useCallback, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePersistedState } from './usePersistedState';
import { AlertTriangle } from 'lucide-react';
import type { Todo, LogEntry } from './types';
import { loadTodos, loadArchivedTodos, updateTodo, addManualTodo, trashTodo, trashCompletedTodos, archiveTodo, unarchiveTodo, bulkUpdateTodos, bulkTrashTodos, reorderTodos, snoozeTodo } from './storage';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { EmptyTodos } from './EmptyIllustrations';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDateGroup } from './utils/dateFormat';
import { playComplete } from './sounds';

// Extracted components
import {
  TodoActionSheet, renderTodoItem, isStaleTodo, isOverdue, isDueToday, PRIORITY_ORDER,
  type TodoRenderContext,
} from './components/TodoItem';
import {
  TodoTabs, DueFilterBar, ProgressSummary, BulkActionBar, TodoHeaderActions,
  type SortKey, type GroupKey, type TabKey,
} from './components/TodoToolbar';

function formatDateGroupTs(ts: number): string {
  return formatDateGroup(new Date(ts).toISOString());
}

interface TodoViewProps {
  logs: LogEntry[];
  onBack: () => void;
  onOpenLog: (id: string) => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

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
function TodoView({ logs, onBack, onOpenLog, lang, showToast }: TodoViewProps) {
  const [todosVersion, setTodosVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todos = useMemo(() => loadTodos(), [todosVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const archivedTodos = useMemo(() => loadArchivedTodos(), [todosVersion]);

  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('threadlog_todos_sort', 'created');
  const [groupKey, setGroupKey] = usePersistedState<GroupKey>('threadlog_todos_group', 'none');
  const [actionSheetTodo, setActionSheetTodo] = useState<Todo | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

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

  // Add form state
  const [addOpen, setAddOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low' | ''>('');
  const [newDueDate, setNewDueDate] = useState('');
  const [todoError, setTodoError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listParentRef = useRef<HTMLDivElement>(null);

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
        setEditingTodoId(todo.id);
        setEditDraft(todo.text);
        setActionSheetTodo(null);
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
  const sorted = useMemo(() => [...displayed].sort((a, b) => {
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
        const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        return b.createdAt - a.createdAt;
      }
    }
  }), [displayed, sortKey]);

  // Group
  const logMap = useMemo(() => {
    const map = new Map<string, LogEntry>();
    for (const log of logs) map.set(log.id, log);
    return map;
  }, [logs]);

  type GroupedEntry = { key: string; label: string; items: Todo[] };

  const groups = useMemo((): GroupedEntry[] => {
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
  }, [groupKey, sorted, lang, logMap]);

  // Virtual scrolling
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: useCallback(() => listParentRef.current, []),
    estimateSize: () => 60,
    overscan: 10,
  });

  // Drag-and-drop
  const dragEnabled = activeTab === 'pending' && groupKey === 'none' && sortKey === 'created' && !selectMode;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  // Render context for TodoItem
  const todoCtx: TodoRenderContext = {
    lang, logMap, selectMode, selectedIds, dragEnabled,
    editingTodoId, editDraft, now,
    onToggle: handleToggle,
    onToggleSelect: toggleSelect,
    onSetActionSheetTodo: setActionSheetTodo,
    onSetEditingTodoId: setEditingTodoId,
    onSetEditDraft: setEditDraft,
    onRefresh: refresh,
    onOpenLog,
    onDelete: (id: string) => {
      trashTodo(id);
      refresh();
      showToast?.(t('moveToTrash', lang), 'success');
    },
    onToggleDone: handleToggle,
  };

  const showSourcePerItem = groupKey !== 'source';

  return (
    <div className="workspace-content-wide">
      <div className="page-header page-header-sticky">
        <button className="btn-back mb-md" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2>{t('todos', lang)}</h2>
            <p className="page-subtitle">{pending.length} {t('todoPending', lang)} · {completed.length} {t('todoCompleted', lang)}</p>
          </div>
          <TodoHeaderActions
            lang={lang}
            selectMode={selectMode}
            displayedCount={displayed.length}
            completedCount={completed.length}
            onAdd={() => { setAddOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            onStartSelect={() => { setSelectMode(true); setSelectedIds(new Set()); }}
            onDeleteCompleted={handleDeleteCompleted}
          />
        </div>
      </div>

      {/* Stale TODO banner */}
      {staleTodos.length > 0 && activeTab === 'pending' && !staleFilter && (
        <button
          className="stale-todo-banner"
          onClick={() => setStaleFilter(true)}
          type="button"
        >
          <AlertTriangle size={14} />
          <span>{tf('staleTodoBanner', lang, staleTodos.length)}</span>
        </button>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        lang={lang}
        selectMode={selectMode}
        selectedIds={selectedIds}
        sorted={sorted}
        activeTab={activeTab}
        onSelectAll={() => {
          if (selectedIds.size === sorted.length) {
            setSelectedIds(new Set());
          } else {
            setSelectedIds(new Set(sorted.map((td) => td.id)));
          }
        }}
        onBulkDone={handleBulkDone}
        onBulkDelete={() => setConfirmBulkDelete(true)}
        onBulkCopy={async () => {
          const selected = sorted.filter((td) => selectedIds.has(td.id));
          const text = selected.map((td) => td.text).join('\n');
          try {
            await navigator.clipboard.writeText(text);
            showToast?.(tf('todoBulkCopied', lang, selected.length), 'success');
          } catch {
            showToast?.(t('copyFailed', lang), 'error');
          }
        }}
        onCancel={() => { setSelectMode(false); setSelectedIds(new Set()); }}
      />

      {/* Toolbar */}
      <TodoTabs
        activeTab={activeTab}
        pendingCount={pending.length}
        completedCount={completed.length}
        archivedCount={archivedTodos.length}
        lang={lang}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        groupKey={groupKey}
        onGroupKeyChange={setGroupKey}
        staleTodos={staleTodos}
        staleFilter={staleFilter}
        onStaleFilterChange={setStaleFilter}
        onTabChange={handleTabChange}
      />

      {/* Due date filter */}
      {activeTab === 'pending' && (
        <DueFilterBar
          lang={lang}
          dueFilter={dueFilter}
          onDueFilterChange={setDueFilter}
        />
      )}

      {/* Progress ring summary */}
      {activeTab === 'pending' && (
        <ProgressSummary
          lang={lang}
          todos={todos}
          pending={pending}
          completed={completed}
          snoozedCount={snoozedCount}
          showSnoozed={showSnoozed}
          onShowSnoozedChange={setShowSnoozed}
        />
      )}

      {/* Stale filter indicator */}
      {staleFilter && (
        <div className="filter-indicator-warning">
          <AlertTriangle size={12} />
          <span>{t('todoFilterStale', lang)}: {staleTodos.length}</span>
          <button
            className="btn btn-xs-dismiss"
            onClick={() => setStaleFilter(false)}
          >
            ×
          </button>
        </div>
      )}

      {/* Add TODO form */}
      {addOpen && (
        <div className="content-card mb-20">
          <div className="form-row">
            <input
              ref={inputRef}
              className="input flex-1"
              type="text"
              value={newText}
              onChange={(e) => { setNewText(e.target.value); setTodoError(''); }}
              onBlur={() => { if (addOpen && newText.trim() === '') setTodoError(t('todoInputRequired', lang)); }}
              onKeyDown={handleKeyDown}
              placeholder={t('todoAddPlaceholder', lang)}
              aria-label={t('ariaTodoInput', lang)}
              maxLength={200}
            />
            <button className="btn btn-primary shrink-0" onClick={handleAdd} disabled={!newText.trim()}>
              {t('todoAddBtn', lang)}
            </button>
            <button className="btn shrink-0" onClick={() => { setAddOpen(false); setNewText(''); setTodoError(''); }}>
              ×
            </button>
          </div>
          {todoError && (
            <p className="error-text-sm">{todoError}</p>
          )}
          <div className="form-options-row">
            <label className="form-label-inline">
              {t('todoSortPriority', lang)}:
              <select
                className="input input-sm input-sm-compact"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as '' | 'high' | 'medium' | 'low')}
              >
                <option value="">{t('todoPriorityNone', lang)}</option>
                <option value="high">{t('todoPriorityHigh', lang)}</option>
                <option value="medium">{t('todoPriorityMedium', lang)}</option>
                <option value="low">{t('todoPriorityLow', lang)}</option>
              </select>
            </label>
            <label className="form-label-inline">
              {t('todoDueDate', lang)}:
              <input
                className="input input-sm input-sm-compact"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
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
              className="btn btn-primary mt-md"
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
                  <div role="list" className="todo-list-col">
                    {sorted.slice(0, todoVisibleCount).map((todo) => (
                      <SortableTodoItem key={todo.id} id={todo.id} disabled={false}>
                        {({ handleProps }) => renderTodoItem(todo, true, todoCtx, handleProps)}
                      </SortableTodoItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div
                ref={listParentRef}
                role="list"
                className="virtual-list-scroll"
              >
                <div className="virtual-list-container w-full" style={{ height: virtualizer.getTotalSize() }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const todo = sorted[virtualRow.index];
                    return (
                      <div
                        key={todo.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        className="virtual-item"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        {renderTodoItem(todo, true, todoCtx)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="group-container">
          {groups.map((group) => (
            <div key={group.key} className="content-card">
              {group.label && (
                <div className="group-header">
                  <span className="group-label">
                    {group.label}
                  </span>
                  <span className="meta text-xs-muted" style={{ marginLeft: 8 }}>
                    {group.items.length}
                  </span>
                  {groupKey === 'source' && group.key !== '_manual' && (() => {
                    const log = logMap.get(group.key);
                    return log ? (
                      <button
                        className="btn-link text-xs-muted" style={{ marginLeft: 8 }}
                        onClick={() => onOpenLog(group.key)}
                      >
                        {t('todoFromLog', lang)} →
                      </button>
                    ) : null;
                  })()}
                </div>
              )}
              <div role="list" className="todo-list-col">
                {group.items.map((todo) => renderTodoItem(todo, showSourcePerItem, todoCtx))}
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

export default memo(TodoView);
