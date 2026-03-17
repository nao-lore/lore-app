/**
 * useDataStore.test.tsx — Unit tests for the useDataStore hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

import { useDataStore } from '../hooks/useDataStore';
import {
  addLog,
  addProject,
  addManualTodo,
  saveMasterNote,
  updateTodo,
  invalidateLogsCache,
  invalidateProjectsCache,
  invalidateTodosCache,
  invalidateMasterNotesCache,
} from '../storage';
import type { LogEntry, MasterNote } from '../types';

function makeLog(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    title: 'Test',
    createdAt: new Date().toISOString(),
    tags: [],
    today: [],
    decisions: [],
    todo: [],
    outputMode: 'handoff',
    relatedProjects: [],
    ...overrides,
  } as LogEntry;
}

function makeMasterNote(projectId: string): MasterNote {
  return {
    id: crypto.randomUUID(),
    projectId,
    overview: 'Overview',
    currentStatus: 'Active',
    decisions: [],
    openIssues: [],
    nextActions: [],
    relatedLogIds: [],
    updatedAt: Date.now(),
  };
}

describe('useDataStore — data loading', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('initializes with empty data', () => {
    const { result } = renderHook(() => useDataStore());
    expect(result.current.logs).toHaveLength(0);
    expect(result.current.projects).toHaveLength(0);
    expect(result.current.todos).toHaveLength(0);
    expect(result.current.masterNotes).toHaveLength(0);
  });

  it('loads existing logs', () => {
    addLog(makeLog({ title: 'Existing' }));
    const { result } = renderHook(() => useDataStore());
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].title).toBe('Existing');
  });

  it('loads existing projects', () => {
    addProject('My Project');
    const { result } = renderHook(() => useDataStore());
    expect(result.current.projects).toHaveLength(1);
  });

  it('loads existing todos', () => {
    addManualTodo('Test todo');
    const { result } = renderHook(() => useDataStore());
    expect(result.current.todos).toHaveLength(1);
  });

  it('loads existing master notes', () => {
    saveMasterNote(makeMasterNote('proj1'));
    const { result } = renderHook(() => useDataStore());
    expect(result.current.masterNotes).toHaveLength(1);
  });
});

describe('useDataStore — refresh', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('refreshLogs triggers re-read of data', () => {
    const { result } = renderHook(() => useDataStore());
    expect(result.current.logs).toHaveLength(0);

    addLog(makeLog({ title: 'New' }));
    act(() => { result.current.refreshLogs(); });
    expect(result.current.logs).toHaveLength(1);
  });

  it('refreshLogs also refreshes projects', () => {
    const { result } = renderHook(() => useDataStore());
    addProject('New Proj');
    act(() => { result.current.refreshLogs(); });
    expect(result.current.projects).toHaveLength(1);
  });

  it('refreshLogs also refreshes todos', () => {
    const { result } = renderHook(() => useDataStore());
    addManualTodo('New todo');
    act(() => { result.current.refreshLogs(); });
    expect(result.current.todos).toHaveLength(1);
  });
});

describe('useDataStore — computed values', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('pendingTodosCount counts undone, unarchived todos', () => {
    addManualTodo('Pending 1');
    addManualTodo('Pending 2');
    const { result } = renderHook(() => useDataStore());
    expect(result.current.pendingTodosCount).toBe(2);
  });

  it('pendingTodosCount excludes done todos', () => {
    addManualTodo('Done');
    const { result: r1 } = renderHook(() => useDataStore());
    const id = r1.current.todos[0].id;
    updateTodo(id, { done: true });
    invalidateTodosCache();
    const { result } = renderHook(() => useDataStore());
    expect(result.current.pendingTodosCount).toBe(0);
  });

  it('pendingCount counts all undone todos', () => {
    addManualTodo('A');
    addManualTodo('B');
    const { result } = renderHook(() => useDataStore());
    expect(result.current.pendingCount).toBe(2);
  });

  it('todayKey is a valid ISO date string', () => {
    const { result } = renderHook(() => useDataStore());
    expect(result.current.todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('overdueTodos detects todos past due', () => {
    addManualTodo('Overdue');
    const { result: r1 } = renderHook(() => useDataStore());
    updateTodo(r1.current.todos[0].id, { dueDate: '2020-01-01' });
    invalidateTodosCache();
    const { result } = renderHook(() => useDataStore());
    expect(result.current.overdueTodos).toHaveLength(1);
  });

  it('overdueTodos excludes done todos', () => {
    addManualTodo('Done overdue');
    const { result: r1 } = renderHook(() => useDataStore());
    updateTodo(r1.current.todos[0].id, { dueDate: '2020-01-01', done: true });
    invalidateTodosCache();
    const { result } = renderHook(() => useDataStore());
    expect(result.current.overdueTodos).toHaveLength(0);
  });

  it('lastLogCreatedAt returns null when no logs', () => {
    const { result } = renderHook(() => useDataStore());
    expect(result.current.lastLogCreatedAt).toBeNull();
  });

  it('lastLogCreatedAt returns the last log date', () => {
    addLog(makeLog({ createdAt: '2025-01-01T00:00:00Z' }));
    const { result } = renderHook(() => useDataStore());
    expect(result.current.lastLogCreatedAt).toBe('2025-01-01T00:00:00Z');
  });
});
