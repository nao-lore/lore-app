import { useState, useMemo, memo } from 'react';
import { usePersistedState } from './usePersistedState';
import type { Todo, LogEntry } from './types';
import { loadTodos, loadArchivedTodos, updateTodo, addManualTodo, trashTodo, trashCompletedTodos, archiveTodo, unarchiveTodo, bulkUpdateTodos, bulkTrashTodos, snoozeTodo } from './storage';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { formatDateGroup } from './utils/dateFormat';
import { playComplete } from './sounds';

// Extracted components
import { TodoActionSheet, type TodoRenderContext } from './components/TodoItem';
import { isStaleTodo, isOverdue, isDueToday, PRIORITY_ORDER } from './components/todoItemHelpers';
import { TodoTabs, DueFilterBar, ProgressSummary, BulkActionBar, TodoHeaderActions, type SortKey, type GroupKey, type TabKey } from './components/TodoToolbar';
import { TodoListContent } from './components/TodoListContent';
import { StaleBanner, StaleFilterIndicator, TodoInlineAddForm } from './components/TodoHeader';

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

function TodoView({ logs, onBack, onOpenLog, lang, showToast }: TodoViewProps) {
  const [todosVersion, setTodosVersion] = useState(0);
  const todos = useMemo(() => { void todosVersion; return loadTodos(); }, [todosVersion]);
  const archivedTodos = useMemo(() => { void todosVersion; return loadArchivedTodos(); }, [todosVersion]);

  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('threadlog_todos_sort', 'created');
  const [groupKey, setGroupKey] = usePersistedState<GroupKey>('threadlog_todos_group', 'none');
  const [actionSheetTodo, setActionSheetTodo] = useState<Todo | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteCompleted, setConfirmDeleteCompleted] = useState(false);
  const [staleFilter, setStaleFilter] = useState(false);
  const [dueFilter, setDueFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('all');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const TODO_PAGE_SIZE = 50;
  const [todoVisibleCount, setTodoVisibleCount] = useState(TODO_PAGE_SIZE);
  const [addOpen, setAddOpen] = useState(false);

  const refresh = () => setTodosVersion((v) => v + 1);

  const handleToggle = (id: string, done: boolean) => {
    updateTodo(id, { done: !done }); refresh();
    if (!done) playComplete();
    showToast?.(!done ? t('todoMarkDone', lang) : t('todoMarkUndone', lang), 'success');
  };

  const handleAction = (todo: Todo, action: string, value?: string) => {
    switch (action) {
      case 'toggle': updateTodo(todo.id, { done: !todo.done }); break;
      case 'pin': updateTodo(todo.id, { pinned: !todo.pinned }); break;
      case 'priority': updateTodo(todo.id, { priority: (value as Todo['priority']) || undefined }); break;
      case 'due': updateTodo(todo.id, { dueDate: value || undefined }); break;
      case 'edit': setEditingTodoId(todo.id); setEditDraft(todo.text); setActionSheetTodo(null); break;
      case 'openLog': if (todo.logId) onOpenLog(todo.logId); return;
      case 'archive': if (todo.archivedAt) unarchiveTodo(todo.id); else archiveTodo(todo.id); break;
      case 'snooze': { const until = value ? Number(value) : 0; snoozeTodo(todo.id, until || 0); if (until > 0) showToast?.(t('snoozed', lang), 'success'); break; }
      case 'delete': trashTodo(todo.id); showToast?.(t('moveToTrash', lang), 'success'); break;
    }
    refresh();
  };

  const handleAdd = (text: string, priority: string, dueDate: string) => {
    addManualTodo(text, { priority: (priority as 'high' | 'medium' | 'low') || undefined, dueDate: dueDate || undefined });
    refresh();
    showToast?.(t('todoAdd', lang), 'success');
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
          return new Date(td.dueDate) >= today && new Date(td.dueDate) <= endOfWeek;
        }
        return true;
      })
    : afterStaleFilter;

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab); setSelectMode(false); setSelectedIds(new Set()); setStaleFilter(false); setDueFilter('all'); setTodoVisibleCount(TODO_PAGE_SIZE);
  };

  const toggleSelect = (id: string) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };

  const sorted = useMemo(() => [...displayed].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    switch (sortKey) {
      case 'title': return a.text.localeCompare(b.text);
      case 'priority': { const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3; const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3; return pa - pb || b.createdAt - a.createdAt; }
      case 'due': { const da = a.dueDate || '9999-12-31'; const db = b.dueDate || '9999-12-31'; return da.localeCompare(db) || b.createdAt - a.createdAt; }
      case 'created':
      default: { const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER; const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER; if (sa !== sb) return sa - sb; return b.createdAt - a.createdAt; }
    }
  }), [displayed, sortKey]);

  const logMap = useMemo(() => { const map = new Map<string, LogEntry>(); for (const log of logs) map.set(log.id, log); return map; }, [logs]);

  type GroupedEntry = { key: string; label: string; items: Todo[] };
  const groups = useMemo((): GroupedEntry[] => {
    if (groupKey === 'none') return [{ key: '_all', label: '', items: sorted }];
    const map = new Map<string, { label: string; items: Todo[] }>(); const order: string[] = [];
    for (const todo of sorted) {
      let key: string; let label: string;
      switch (groupKey) {
        case 'date': { const d = new Date(todo.createdAt); key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; label = formatDateGroupTs(todo.createdAt); break; }
        case 'priority': { key = todo.priority || 'none'; const pLabels: Record<string, string> = { high: t('todoPriorityHigh', lang), medium: t('todoPriorityMedium', lang), low: t('todoPriorityLow', lang), none: t('todoPriorityNone', lang) }; label = pLabels[key] || key; break; }
        case 'source': { key = todo.logId || '_manual'; label = todo.logId ? (logMap.get(todo.logId)?.title || todo.logId) : t('todoManual', lang); break; }
        default: key = '_all'; label = '';
      }
      if (!map.has(key)) { map.set(key, { label, items: [] }); order.push(key); }
      map.get(key)!.items.push(todo);
    }
    if (groupKey === 'priority') return ['high', 'medium', 'low', 'none'].filter((k) => map.has(k)).map((k) => ({ key: k, ...map.get(k)! }));
    return order.map((k) => ({ key: k, ...map.get(k)! }));
  }, [groupKey, sorted, lang, logMap]);

  const dragEnabled = activeTab === 'pending' && groupKey === 'none' && sortKey === 'created' && !selectMode;
  const showSourcePerItem = groupKey !== 'source';

  const todoCtx: TodoRenderContext = {
    lang, logMap, selectMode, selectedIds, dragEnabled, editingTodoId, editDraft, now,
    onToggle: handleToggle, onToggleSelect: toggleSelect, onSetActionSheetTodo: setActionSheetTodo,
    onSetEditingTodoId: setEditingTodoId, onSetEditDraft: setEditDraft, onRefresh: refresh, onOpenLog,
    onDelete: (id: string) => { trashTodo(id); refresh(); showToast?.(t('moveToTrash', lang), 'success'); },
    onToggleDone: handleToggle,
  };

  return (
    <div className="workspace-content-wide">
      <div className="page-header page-header-sticky">
        <button className="btn-back mb-md" onClick={onBack}>← {t('back', lang)}</button>
        <div className="page-header-row">
          <div>
            <h2>{t('todos', lang)}</h2>
            <p className="page-subtitle">{pending.length} {t('todoPending', lang)} · {completed.length} {t('todoCompleted', lang)}</p>
          </div>
          <TodoHeaderActions lang={lang} selectMode={selectMode} displayedCount={displayed.length} completedCount={completed.length} onAdd={() => setAddOpen(true)} onStartSelect={() => { setSelectMode(true); setSelectedIds(new Set()); }} onDeleteCompleted={() => { if (completed.length > 0) setConfirmDeleteCompleted(true); }} />
        </div>
      </div>

      {staleTodos.length > 0 && activeTab === 'pending' && !staleFilter && (
        <StaleBanner lang={lang} staleCount={staleTodos.length} onActivate={() => setStaleFilter(true)} />
      )}

      <BulkActionBar lang={lang} selectMode={selectMode} selectedIds={selectedIds} sorted={sorted} activeTab={activeTab}
        onSelectAll={() => { if (selectedIds.size === sorted.length) setSelectedIds(new Set()); else setSelectedIds(new Set(sorted.map((td) => td.id))); }}
        onBulkDone={() => { bulkUpdateTodos(Array.from(selectedIds), { done: true }); setSelectedIds(new Set()); setSelectMode(false); refresh(); }}
        onBulkDelete={() => setConfirmBulkDelete(true)}
        onBulkCopy={async () => { const sel = sorted.filter((td) => selectedIds.has(td.id)); try { await navigator.clipboard.writeText(sel.map((td) => td.text).join('\n')); showToast?.(tf('todoBulkCopied', lang, sel.length), 'success'); } catch { showToast?.(t('copyFailed', lang), 'error'); } }}
        onCancel={() => { setSelectMode(false); setSelectedIds(new Set()); }}
      />

      <TodoTabs activeTab={activeTab} pendingCount={pending.length} completedCount={completed.length} archivedCount={archivedTodos.length} lang={lang} sortKey={sortKey} onSortKeyChange={setSortKey} groupKey={groupKey} onGroupKeyChange={setGroupKey} staleTodos={staleTodos} staleFilter={staleFilter} onStaleFilterChange={setStaleFilter} onTabChange={handleTabChange} />

      {activeTab === 'pending' && <DueFilterBar lang={lang} dueFilter={dueFilter} onDueFilterChange={setDueFilter} />}

      {activeTab === 'pending' && <ProgressSummary lang={lang} todos={todos} pending={pending} completed={completed} snoozedCount={snoozedCount} showSnoozed={showSnoozed} onShowSnoozedChange={setShowSnoozed} />}

      {staleFilter && <StaleFilterIndicator lang={lang} staleCount={staleTodos.length} onClear={() => setStaleFilter(false)} />}

      {addOpen && <TodoInlineAddForm lang={lang} showToast={showToast} onRefresh={refresh} onClose={() => setAddOpen(false)} onAdd={handleAdd} />}

      <TodoListContent sorted={sorted} todoVisibleCount={todoVisibleCount} dragEnabled={dragEnabled} selectMode={selectMode} groupKey={groupKey} activeTab={activeTab} addOpen={addOpen} groups={groups} showSourcePerItem={showSourcePerItem} todoCtx={todoCtx} logMap={logMap} onOpenLog={onOpenLog} onOpenAddForm={() => setAddOpen(true)} onRefresh={refresh} lang={lang} />

      {actionSheetTodo && <TodoActionSheet todo={actionSheetTodo} lang={lang} logTitle={actionSheetTodo.logId ? logMap.get(actionSheetTodo.logId)?.title : undefined} onClose={() => setActionSheetTodo(null)} onAction={(action, value) => handleAction(actionSheetTodo, action, value)} />}

      {confirmBulkDelete && <ConfirmDialog title={tf('todoBulkDeleteConfirm', lang, selectedIds.size)} description={t('todoBulkDeleteConfirmDesc', lang)} confirmLabel={t('confirmDeleteBtn', lang)} cancelLabel={t('cancel', lang)} onConfirm={() => { bulkTrashTodos(Array.from(selectedIds)); setConfirmBulkDelete(false); setSelectedIds(new Set()); setSelectMode(false); refresh(); }} onCancel={() => setConfirmBulkDelete(false)} />}

      {confirmDeleteCompleted && <ConfirmDialog title={t('todoDeleteCompletedConfirm', lang)} description={t('todoBulkDeleteConfirmDesc', lang)} confirmLabel={t('confirmDeleteBtn', lang)} cancelLabel={t('cancel', lang)} onConfirm={() => { trashCompletedTodos(); setConfirmDeleteCompleted(false); refresh(); showToast?.(t('todoDeleteCompleted', lang), 'success'); }} onCancel={() => setConfirmDeleteCompleted(false)} />}
    </div>
  );
}

export default memo(TodoView);
