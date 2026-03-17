/**
 * storage-todos.test.ts — Unit tests for todos storage module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

import {
  loadTodos,
  loadArchivedTodos,
  loadTrashedTodos,
  addManualTodo,
  addTodosFromLog,
  addTodosFromLogWithMeta,
  updateTodo,
  trashTodo,
  restoreTodo,
  deleteTodo,
  archiveTodo,
  unarchiveTodo,
  bulkUpdateTodos,
  bulkTrashTodos,
  reorderTodos,
  snoozeTodo,
  trashCompletedTodos,
  deleteTodosForLog,
  invalidateTodosCache,
} from '../storage';

describe('storage/todos — CRUD', () => {
  beforeEach(() => {
    store.clear();
    invalidateTodosCache();
  });

  it('addManualTodo creates a todo', () => {
    addManualTodo('Buy milk');
    const todos = loadTodos();
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe('Buy milk');
    expect(todos[0].done).toBe(false);
    expect(todos[0].logId).toBe('');
  });

  it('addManualTodo with extra fields', () => {
    addManualTodo('Task', { priority: 'high', dueDate: '2025-12-31' });
    const t = loadTodos()[0];
    expect(t.priority).toBe('high');
    expect(t.dueDate).toBe('2025-12-31');
  });

  it('addTodosFromLog creates multiple todos', () => {
    addTodosFromLog('log1', ['Task A', 'Task B', 'Task C']);
    const todos = loadTodos();
    expect(todos).toHaveLength(3);
    expect(todos.every((t) => t.logId === 'log1')).toBe(true);
  });

  it('addTodosFromLog with empty items does nothing', () => {
    addTodosFromLog('log1', []);
    expect(loadTodos()).toHaveLength(0);
  });

  it('addTodosFromLogWithMeta creates todos with priority and dueDate', () => {
    addTodosFromLogWithMeta('log1', [
      { title: 'Urgent', priority: 'high' },
      { title: 'Later', dueDate: '2025-06-01' },
    ]);
    const todos = loadTodos();
    expect(todos).toHaveLength(2);
    const urgent = todos.find((t) => t.text === 'Urgent');
    expect(urgent!.priority).toBe('high');
    const later = todos.find((t) => t.text === 'Later');
    expect(later!.dueDate).toBe('2025-06-01');
  });

  it('updateTodo modifies fields', () => {
    addManualTodo('Original');
    const id = loadTodos()[0].id;
    updateTodo(id, { text: 'Updated', done: true });
    const t = loadTodos()[0];
    expect(t.text).toBe('Updated');
    expect(t.done).toBe(true);
  });

  it('trashTodo moves to trash', () => {
    addManualTodo('Trash me');
    const id = loadTodos()[0].id;
    trashTodo(id);
    expect(loadTodos()).toHaveLength(0);
    expect(loadTrashedTodos()).toHaveLength(1);
  });

  it('restoreTodo restores from trash', () => {
    addManualTodo('Restore me');
    const id = loadTodos()[0].id;
    trashTodo(id);
    restoreTodo(id);
    expect(loadTodos()).toHaveLength(1);
    expect(loadTrashedTodos()).toHaveLength(0);
  });

  it('deleteTodo permanently removes', () => {
    addManualTodo('Delete me');
    const id = loadTodos()[0].id;
    deleteTodo(id);
    expect(loadTodos()).toHaveLength(0);
    expect(loadTrashedTodos()).toHaveLength(0);
  });
});

describe('storage/todos — archiving', () => {
  beforeEach(() => {
    store.clear();
    invalidateTodosCache();
  });

  it('archiveTodo moves to archive', () => {
    addManualTodo('Archive me');
    const id = loadTodos()[0].id;
    archiveTodo(id);
    expect(loadTodos()).toHaveLength(0);
    expect(loadArchivedTodos()).toHaveLength(1);
  });

  it('unarchiveTodo restores from archive', () => {
    addManualTodo('Unarchive');
    const id = loadTodos()[0].id;
    archiveTodo(id);
    unarchiveTodo(id);
    expect(loadTodos()).toHaveLength(1);
    expect(loadArchivedTodos()).toHaveLength(0);
  });

  it('archived todos do not appear in loadTodos', () => {
    addManualTodo('Active');
    addManualTodo('ToArchive');
    const todos = loadTodos();
    archiveTodo(todos[0].id);
    expect(loadTodos()).toHaveLength(1);
  });
});

describe('storage/todos — bulk operations', () => {
  beforeEach(() => {
    store.clear();
    invalidateTodosCache();
  });

  it('bulkUpdateTodos updates multiple todos', () => {
    addManualTodo('A');
    addManualTodo('B');
    addManualTodo('C');
    const ids = loadTodos().map((t) => t.id);
    bulkUpdateTodos([ids[0], ids[1]], { done: true });
    const todos = loadTodos();
    const doneCount = todos.filter((t) => t.done).length;
    expect(doneCount).toBe(2);
  });

  it('bulkTrashTodos trashes multiple', () => {
    addManualTodo('X');
    addManualTodo('Y');
    const ids = loadTodos().map((t) => t.id);
    bulkTrashTodos(ids);
    expect(loadTodos()).toHaveLength(0);
    expect(loadTrashedTodos()).toHaveLength(2);
  });

  it('trashCompletedTodos trashes only done items', () => {
    addManualTodo('Not done');
    addManualTodo('Done');
    const todos = loadTodos();
    // addManualTodo prepends, so 'Done' is first
    const doneItem = todos.find((t) => t.text === 'Done')!;
    updateTodo(doneItem.id, { done: true });
    const count = trashCompletedTodos();
    expect(count).toBe(1);
    expect(loadTodos()).toHaveLength(1);
    expect(loadTodos()[0].text).toBe('Not done');
  });

  it('trashCompletedTodos returns 0 when no done items', () => {
    addManualTodo('Active');
    expect(trashCompletedTodos()).toBe(0);
  });
});

describe('storage/todos — reorder & snooze', () => {
  beforeEach(() => {
    store.clear();
    invalidateTodosCache();
  });

  it('reorderTodos assigns sortOrder', () => {
    addManualTodo('First');
    addManualTodo('Second');
    addManualTodo('Third');
    const todos = loadTodos();
    const reversed = [todos[2].id, todos[1].id, todos[0].id];
    reorderTodos(reversed);
    const reordered = loadTodos();
    const first = reordered.find((t) => t.id === reversed[0]);
    const last = reordered.find((t) => t.id === reversed[2]);
    expect(first!.sortOrder).toBe(0);
    expect(last!.sortOrder).toBe(2);
  });

  it('snoozeTodo sets snoozedUntil', () => {
    addManualTodo('Snooze me');
    const id = loadTodos()[0].id;
    const until = Date.now() + 86400000;
    snoozeTodo(id, until);
    const t = loadTodos()[0];
    expect(t.snoozedUntil).toBe(until);
  });

  it('deleteTodosForLog removes all todos for a log', () => {
    addTodosFromLog('log-a', ['T1', 'T2']);
    addManualTodo('Manual');
    deleteTodosForLog('log-a');
    expect(loadTodos()).toHaveLength(1);
    expect(loadTodos()[0].text).toBe('Manual');
  });
});
