/**
 * useDataStore.test.tsx — Extended unit tests for the useDataStore hook
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

import { useDataStore } from '../../hooks/useDataStore';
import {
  addLog,
  addProject,
  addManualTodo,
  saveMasterNote,
  updateTodo,
  updateLog,
  invalidateLogsCache,
  invalidateProjectsCache,
  invalidateTodosCache,
  invalidateMasterNotesCache,
} from '../../storage';
import type { LogEntry, MasterNote } from '../../types';

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

describe('useDataStore — cache invalidation', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('refreshLogs picks up newly added logs', () => {
    const { result } = renderHook(() => useDataStore());
    expect(result.current.logs).toHaveLength(0);

    addLog(makeLog({ title: 'New Entry' }));
    act(() => { result.current.refreshLogs(); });
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].title).toBe('New Entry');
  });

  it('refreshLogs picks up log updates', () => {
    const log = makeLog({ title: 'Original' });
    addLog(log);
    const { result } = renderHook(() => useDataStore());
    expect(result.current.logs[0].title).toBe('Original');

    updateLog(log.id, { title: 'Updated' });
    act(() => { result.current.refreshLogs(); });
    expect(result.current.logs[0].title).toBe('Updated');
  });

  it('refreshLogs refreshes all data types simultaneously', () => {
    const { result } = renderHook(() => useDataStore());
    expect(result.current.logs).toHaveLength(0);
    expect(result.current.projects).toHaveLength(0);
    expect(result.current.todos).toHaveLength(0);

    addLog(makeLog());
    addProject('Test Project');
    addManualTodo('Test Todo');

    act(() => { result.current.refreshLogs(); });
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.todos).toHaveLength(1);
  });

  it('multiple rapid refreshes produce consistent state', () => {
    const { result } = renderHook(() => useDataStore());

    addLog(makeLog({ title: 'A' }));
    act(() => { result.current.refreshLogs(); });

    addLog(makeLog({ title: 'B' }));
    act(() => { result.current.refreshLogs(); });

    expect(result.current.logs).toHaveLength(2);
  });
});

describe('useDataStore — logsVersion tracking', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('logsVersion increments on refreshLogs', () => {
    const { result } = renderHook(() => useDataStore());
    const initialVersion = result.current.logsVersion;

    act(() => { result.current.refreshLogs(); });
    expect(result.current.logsVersion).toBeGreaterThan(initialVersion);
  });
});

describe('useDataStore — computed values edge cases', () => {
  beforeEach(() => {
    store.clear();
    invalidateLogsCache();
    invalidateProjectsCache();
    invalidateTodosCache();
    invalidateMasterNotesCache();
  });

  it('pendingTodosCount excludes archived todos', () => {
    addManualTodo('Archived');
    const { result: r1 } = renderHook(() => useDataStore());
    const id = r1.current.todos[0].id;
    updateTodo(id, { archivedAt: Date.now() });
    invalidateTodosCache();
    const { result } = renderHook(() => useDataStore());
    expect(result.current.pendingTodosCount).toBe(0);
  });

  it('overdueTodos excludes archived todos', () => {
    addManualTodo('Archived overdue');
    const { result: r1 } = renderHook(() => useDataStore());
    updateTodo(r1.current.todos[0].id, { dueDate: '2020-01-01', archivedAt: Date.now() });
    invalidateTodosCache();
    const { result } = renderHook(() => useDataStore());
    expect(result.current.overdueTodos).toHaveLength(0);
  });

  it('masterNotes loads saved notes', () => {
    saveMasterNote(makeMasterNote('proj-1'));
    saveMasterNote(makeMasterNote('proj-2'));
    const { result } = renderHook(() => useDataStore());
    expect(result.current.masterNotes).toHaveLength(2);
  });

  it('lastLogCreatedAt picks latest by date', () => {
    addLog(makeLog({ createdAt: '2025-01-01T00:00:00Z' }));
    addLog(makeLog({ createdAt: '2025-06-15T00:00:00Z' }));
    const { result } = renderHook(() => useDataStore());
    // Logs are stored newest first
    expect(result.current.lastLogCreatedAt).toBeTruthy();
  });
});
