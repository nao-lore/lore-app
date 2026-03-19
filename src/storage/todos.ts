import type { Todo } from '../types';
import { TODOS_KEY, safeGetItem, safeSetItem, cache, invalidateTodosCache } from './core';
import { safeJsonParse } from '../utils/safeJsonParse';

// ─── Todos ───

/** Maximum number of completed (non-archived, non-trashed) todos to keep. Oldest are pruned first. */
export const MAX_COMPLETED = 200;

function loadAllTodos(): Todo[] {
  if (cache.todosCache.data !== null && cache.todosCache.version === cache.todosCacheVersion) {
    return cache.todosCache.data;
  }
  const raw = safeGetItem(TODOS_KEY);
  if (!raw) return [];
  const parsed = safeJsonParse<unknown>(raw, []);
  const data = Array.isArray(parsed) ? parsed as Todo[] : [];
  cache.todosCache = { data, version: cache.todosCacheVersion };
  return data;
}

/** Load active (non-trashed, non-archived) todos */
export function loadTodos(): Todo[] {
  return loadAllTodos().filter((t) => !t.trashedAt && !t.archivedAt);
}

/** Load archived todos */
export function loadArchivedTodos(): Todo[] {
  return loadAllTodos().filter((t) => !!t.archivedAt && !t.trashedAt);
}

/** Load trashed todos */
export function loadTrashedTodos(): Todo[] {
  return loadAllTodos().filter((t) => !!t.trashedAt);
}

/** Persist the full todos array to localStorage, pruning excess completed items */
export function saveTodos(todos: Todo[]): void {
  const pruned = pruneCompleted(todos);
  safeSetItem(TODOS_KEY, JSON.stringify(pruned));
  invalidateTodosCache();
}

/** Remove oldest completed (non-archived, non-trashed) todos beyond MAX_COMPLETED */
function pruneCompleted(todos: Todo[]): Todo[] {
  const completed = todos.filter((t) => t.done && !t.trashedAt && !t.archivedAt);
  if (completed.length <= MAX_COMPLETED) return todos;

  // Sort completed by createdAt ascending (oldest first), then take the ones to remove
  const sorted = [...completed].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const removeCount = completed.length - MAX_COMPLETED;
  const removeIds = new Set(sorted.slice(0, removeCount).map((t) => t.id));

  return todos.filter((t) => !removeIds.has(t.id));
}

/** Create todos from a log's todo list (simple string items) */
export function addTodosFromLog(logId: string, items: string[]): void {
  if (items.length === 0) return;
  const todos = loadAllTodos();
  const now = Date.now();
  const newTodos: Todo[] = items.map((text) => ({
    id: crypto.randomUUID(),
    text,
    done: false,
    logId,
    createdAt: now,
  }));
  saveTodos([...newTodos, ...todos]);
}

export function addTodosFromLogWithMeta(logId: string, items: { title: string; priority?: 'high' | 'medium' | 'low'; dueDate?: string }[]): void {
  if (items.length === 0) return;
  const todos = loadAllTodos();
  const now = Date.now();
  const newTodos: Todo[] = items.map((item) => ({
    id: crypto.randomUUID(),
    text: item.title,
    done: false,
    logId,
    createdAt: now,
    ...(item.priority ? { priority: item.priority } : {}),
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
  }));
  saveTodos([...newTodos, ...todos]);
}

export function addManualTodo(text: string, extra?: Partial<Pick<Todo, 'dueDate' | 'priority' | 'tag'>>): void {
  const todos = loadAllTodos();
  const todo: Todo = {
    id: crypto.randomUUID(),
    text,
    done: false,
    logId: '',
    createdAt: Date.now(),
    ...extra,
  };
  saveTodos([todo, ...todos]);
}

/** Move todo to trash */
export function trashTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => t.id === id ? { ...t, trashedAt: Date.now() } : t));
}

/** Move all completed todos to trash */
export function trashCompletedTodos(): number {
  const all = loadAllTodos();
  let count = 0;
  const updated = all.map((t) => {
    if (t.done && !t.trashedAt) {
      count++;
      return { ...t, trashedAt: Date.now() };
    }
    return t;
  });
  if (count > 0) saveTodos(updated);
  return count;
}

/** Restore todo from trash */
export function restoreTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => {
    if (t.id !== id) return t;
    const { trashedAt: _, ...rest } = t;
    void _;
    return rest as Todo;
  }));
}

export function deleteTodo(id: string): void {
  saveTodos(loadAllTodos().filter((t) => t.id !== id));
}

export function updateTodo(id: string, patch: Partial<Todo>): void {
  const todos = loadAllTodos().map((t) => t.id === id ? { ...t, ...patch } : t);
  saveTodos(todos);
}

export function archiveTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => t.id === id ? { ...t, archivedAt: Date.now() } : t));
}

export function unarchiveTodo(id: string): void {
  saveTodos(loadAllTodos().map((t) => {
    if (t.id !== id) return t;
    const { archivedAt: _, ...rest } = t;
    void _;
    return rest as Todo;
  }));
}

export function bulkUpdateTodos(ids: string[], patch: Partial<Todo>): void {
  const idSet = new Set(ids);
  saveTodos(loadAllTodos().map((t) => idSet.has(t.id) ? { ...t, ...patch } : t));
}

export function bulkTrashTodos(ids: string[]): void {
  const idSet = new Set(ids);
  saveTodos(loadAllTodos().map((t) => idSet.has(t.id) ? { ...t, trashedAt: Date.now() } : t));
}

/** Save sort order for todos by ID list (index = sortOrder) */
export function reorderTodos(orderedIds: string[]): void {
  const all = loadAllTodos();
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  saveTodos(all.map((t) => orderMap.has(t.id) ? { ...t, sortOrder: orderMap.get(t.id) } : t));
}

export function snoozeTodo(id: string, until: number): void {
  saveTodos(loadAllTodos().map((t) => t.id === id ? { ...t, snoozedUntil: until } : t));
}

export function deleteTodosForLog(logId: string): void {
  saveTodos(loadAllTodos().filter((t) => t.logId !== logId));
}
