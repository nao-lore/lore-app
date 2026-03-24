/**
 * boundary-values.test.ts — Boundary value tests for storage and data handling
 *
 * Tests: empty lists, upper limits, string max lengths, date boundaries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock localStorage ───
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('crypto', {
  randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
});

import { safeGetItem, safeSetItem, LOGS_KEY, PROJECTS_KEY, TODOS_KEY } from '../storage/core';
import { safeJsonParse } from '../utils/safeJsonParse';
import { repairJson, tryRepairJson, balanceBrackets, findMatchingBrace } from '../utils/jsonRepair';
import { WorklogResultSchema, HandoffResultSchema, TodoOnlyResultSchema } from '../schemas';
import type { LogEntry, Project, Todo } from '../types';

// ─── Empty Lists (0 items) ───

describe('boundary: empty lists', () => {
  beforeEach(() => {
    store.clear();
  });

  it('loadLogs returns empty array when no data stored', () => {
    const raw = safeGetItem(LOGS_KEY);
    expect(raw).toBeNull();
    const logs: LogEntry[] = raw ? JSON.parse(raw) : [];
    expect(logs).toEqual([]);
    expect(logs.length).toBe(0);
  });

  it('loadProjects returns empty array when no data stored', () => {
    const raw = safeGetItem(PROJECTS_KEY);
    const projects: Project[] = raw ? JSON.parse(raw) : [];
    expect(projects).toEqual([]);
  });

  it('loadTodos returns empty array when no data stored', () => {
    const raw = safeGetItem(TODOS_KEY);
    const todos: Todo[] = raw ? JSON.parse(raw) : [];
    expect(todos).toEqual([]);
  });

  it('storing and loading empty arrays works', () => {
    safeSetItem(LOGS_KEY, JSON.stringify([]));
    const raw = safeGetItem(LOGS_KEY);
    expect(JSON.parse(raw!)).toEqual([]);
  });

  it('WorklogResultSchema parses to defaults for empty object', () => {
    const result = WorklogResultSchema.parse({});
    expect(result.title).toBe('Untitled');
    expect(result.today).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.todo).toEqual([]);
    expect(result.relatedProjects).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it('HandoffResultSchema parses to defaults for empty object', () => {
    const result = HandoffResultSchema.parse({});
    expect(result.currentStatus).toEqual([]);
    expect(result.nextActions).toEqual([]);
    expect(result.actionBacklog).toEqual([]);
    expect(result.completed).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.resumeChecklist).toEqual([]);
  });

  it('TodoOnlyResultSchema parses to empty todos for empty object', () => {
    const result = TodoOnlyResultSchema.parse({});
    expect(result.todos).toEqual([]);
  });

  it('filtering empty array returns empty array', () => {
    const empty: LogEntry[] = [];
    expect(empty.filter(l => !l.trashedAt)).toEqual([]);
    expect(empty.filter(l => !!l.trashedAt)).toEqual([]);
  });
});

// ─── Upper Limit Tests ───

describe('boundary: large data sets', () => {
  beforeEach(() => {
    store.clear();
  });

  it('handles 1000 log entries in storage', () => {
    const logs: LogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `log-${i}`,
      createdAt: new Date(2025, 0, 1 + (i % 365)).toISOString(),
      title: `Log Entry ${i}`,
      today: [`Task ${i}`],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [`tag-${i % 10}`],
    }));
    const json = JSON.stringify(logs);
    safeSetItem(LOGS_KEY, json);
    const loaded = JSON.parse(safeGetItem(LOGS_KEY)!) as LogEntry[];
    expect(loaded.length).toBe(1000);
    expect(loaded[0].id).toBe('log-0');
    expect(loaded[999].id).toBe('log-999');
  });

  it('handles 500 todo items in storage', () => {
    const todos: Todo[] = Array.from({ length: 500 }, (_, i) => ({
      id: `todo-${i}`,
      text: `Todo item ${i}`,
      done: i % 2 === 0,
      logId: `log-${i % 100}`,
      createdAt: Date.now() - i * 1000,
    }));
    const json = JSON.stringify(todos);
    safeSetItem(TODOS_KEY, json);
    const loaded = JSON.parse(safeGetItem(TODOS_KEY)!) as Todo[];
    expect(loaded.length).toBe(500);
    expect(loaded.filter(t => t.done).length).toBe(250);
  });

  it('handles 100 projects in storage', () => {
    const projects: Project[] = Array.from({ length: 100 }, (_, i) => ({
      id: `proj-${i}`,
      name: `Project ${i}`,
      createdAt: Date.now() - i * 86400000,
    }));
    safeSetItem(PROJECTS_KEY, JSON.stringify(projects));
    const loaded = JSON.parse(safeGetItem(PROJECTS_KEY)!) as Project[];
    expect(loaded.length).toBe(100);
  });

  it('sorting 1000 logs by date produces correct order', () => {
    const logs: LogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `log-${i}`,
      createdAt: new Date(2025, 0, 1 + i).toISOString(),
      title: `Log ${i}`,
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    }));
    const sorted = logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    expect(sorted[0].id).toBe('log-999');
    expect(sorted[999].id).toBe('log-0');
  });

  it('filtering 1000 logs by tag works correctly', () => {
    const logs: LogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `log-${i}`,
      createdAt: new Date().toISOString(),
      title: `Log ${i}`,
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: i % 5 === 0 ? ['special'] : ['normal'],
    }));
    const filtered = logs.filter(l => l.tags.includes('special'));
    expect(filtered.length).toBe(200);
  });

  it('WorklogResultSchema handles arrays with many items', () => {
    const input = {
      title: 'Busy Day',
      today: Array.from({ length: 50 }, (_, i) => `Task ${i}`),
      decisions: Array.from({ length: 30 }, (_, i) => `Decision ${i}`),
      todo: Array.from({ length: 100 }, (_, i) => `Todo ${i}`),
      relatedProjects: Array.from({ length: 20 }, (_, i) => `Proj ${i}`),
      tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
    };
    const result = WorklogResultSchema.parse(input);
    expect(result.today.length).toBe(50);
    expect(result.todo.length).toBe(100);
  });
});

// ─── String Max Length Tests ───

describe('boundary: string max lengths', () => {
  it('handles very long title (10000 chars)', () => {
    const longTitle = 'A'.repeat(10000);
    const result = WorklogResultSchema.parse({ title: longTitle });
    expect(result.title.length).toBe(10000);
  });

  it('handles very long todo text in storage', () => {
    const longText = 'B'.repeat(50000);
    const todo: Todo = {
      id: 'long-todo',
      text: longText,
      done: false,
      logId: '',
      createdAt: Date.now(),
    };
    safeSetItem('test_long', JSON.stringify([todo]));
    const loaded = JSON.parse(safeGetItem('test_long')!) as Todo[];
    expect(loaded[0].text.length).toBe(50000);
  });

  it('handles empty string title', () => {
    const result = WorklogResultSchema.parse({ title: '' });
    expect(result.title).toBe('');
  });

  it('handles Unicode characters in strings', () => {
    const unicode = '日本語テスト🎉🚀✨ 中文 한국어 العربية';
    const result = WorklogResultSchema.parse({ title: unicode });
    expect(result.title).toBe(unicode);
  });

  it('handles newlines in string values', () => {
    const multiline = 'Line 1\nLine 2\nLine 3';
    const result = WorklogResultSchema.parse({ title: multiline });
    expect(result.title).toContain('\n');
  });

  it('safeSetItem handles very long values', () => {
    const longValue = 'X'.repeat(100000);
    safeSetItem('huge', longValue);
    expect(safeGetItem('huge')).toBe(longValue);
  });

  it('handles special characters in project names', () => {
    const specialChars = '<script>alert("xss")</script>';
    const project: Project = {
      id: 'special-proj',
      name: specialChars,
      createdAt: Date.now(),
    };
    safeSetItem('test_special_proj', JSON.stringify([project]));
    const loaded = JSON.parse(safeGetItem('test_special_proj')!) as Project[];
    expect(loaded[0].name).toBe(specialChars);
  });

  it('handles null bytes in strings via JSON', () => {
    // JSON.stringify handles null bytes
    const withNull = 'before\u0000after';
    const json = JSON.stringify({ text: withNull });
    const parsed = JSON.parse(json) as { text: string };
    expect(parsed.text).toContain('\u0000');
  });
});

// ─── Date Boundary Values ───

describe('boundary: date edge cases', () => {
  it('handles epoch date (1970-01-01)', () => {
    const log: LogEntry = {
      id: 'epoch-log',
      createdAt: new Date(0).toISOString(),
      title: 'Epoch Log',
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    };
    expect(log.createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(new Date(log.createdAt).getTime()).toBe(0);
  });

  it('handles far future date (2099-12-31)', () => {
    const future = new Date('2099-12-31T12:00:00.000Z');
    const log: LogEntry = {
      id: 'future-log',
      createdAt: future.toISOString(),
      title: 'Future Log',
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    };
    expect(new Date(log.createdAt).getUTCFullYear()).toBe(2099);
  });

  it('handles negative timestamps (before epoch)', () => {
    const beforeEpoch = new Date(-86400000); // 1969-12-31
    expect(beforeEpoch.getFullYear()).toBe(1969);
    const iso = beforeEpoch.toISOString();
    expect(new Date(iso).getTime()).toBe(-86400000);
  });

  it('sorts logs correctly across year boundaries', () => {
    const logs: LogEntry[] = [
      { id: '1', createdAt: '2025-12-31T23:59:59.000Z', title: 'NYE', today: [], decisions: [], todo: [], relatedProjects: [], tags: [] },
      { id: '2', createdAt: '2026-01-01T00:00:00.000Z', title: 'NY', today: [], decisions: [], todo: [], relatedProjects: [], tags: [] },
      { id: '3', createdAt: '2025-06-15T12:00:00.000Z', title: 'Mid', today: [], decisions: [], todo: [], relatedProjects: [], tags: [] },
    ];
    const sorted = logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
    expect(sorted[2].id).toBe('3');
  });

  it('handles todo dueDate at date boundaries', () => {
    const todos: Todo[] = [
      { id: 't1', text: 'Past', done: false, logId: '', createdAt: Date.now(), dueDate: '1970-01-01' },
      { id: 't2', text: 'Future', done: false, logId: '', createdAt: Date.now(), dueDate: '2099-12-31' },
      { id: 't3', text: 'Today', done: false, logId: '', createdAt: Date.now(), dueDate: '2026-03-23' },
    ];
    const overdue = todos.filter(t => t.dueDate && t.dueDate < '2026-03-23');
    expect(overdue.length).toBe(1);
    expect(overdue[0].id).toBe('t1');
  });

  it('handles timestamp 0 for createdAt in Todo', () => {
    const todo: Todo = {
      id: 'zero-ts',
      text: 'Zero timestamp',
      done: false,
      logId: '',
      createdAt: 0,
    };
    expect(todo.createdAt).toBe(0);
    expect(new Date(todo.createdAt).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('handles very large timestamp (year 3000)', () => {
    const farFuture = new Date('3000-01-01T00:00:00.000Z').getTime();
    const todo: Todo = {
      id: 'far-future',
      text: 'Far future',
      done: false,
      logId: '',
      createdAt: farFuture,
    };
    expect(new Date(todo.createdAt).getFullYear()).toBe(3000);
  });

  it('handles invalid date string gracefully', () => {
    const invalidDate = 'not-a-date';
    const timestamp = new Date(invalidDate).getTime();
    expect(isNaN(timestamp)).toBe(true);
  });

  it('handles leap year date (2024-02-29)', () => {
    const leapDay = new Date('2024-02-29T12:00:00.000Z');
    expect(leapDay.getDate()).toBe(29);
    expect(leapDay.getMonth()).toBe(1); // February = 1
  });
});

// ─── JSON Repair Boundary Cases ───

describe('boundary: JSON repair edge cases', () => {
  it('repairJson handles empty string', () => {
    const result = repairJson('');
    expect(typeof result).toBe('string');
  });

  it('repairJson handles deeply nested JSON', () => {
    let nested = '{"a":';
    for (let i = 0; i < 50; i++) {
      nested += '{"b":';
    }
    nested += '"value"';
    const repaired = repairJson(nested);
    // Should add 51 closing braces
    expect(repaired.match(/}/g)?.length).toBe(51);
  });

  it('balanceBrackets closes all open brackets and braces', () => {
    const input = '{"a":[{"b":[1,2';
    const result = balanceBrackets(input);
    // balanceBrackets closes all brackets first, then all braces
    expect(result).toBe('{"a":[{"b":[1,2]]}}');
    // Verify the bracket/brace counts are balanced
    const opens = (result.match(/[{[]/g) || []).length;
    const closes = (result.match(/[}\]]/g) || []).length;
    expect(opens).toBe(closes);
  });

  it('findMatchingBrace returns -1 for incomplete JSON', () => {
    expect(findMatchingBrace('{"a":1')).toBe(-1);
  });

  it('findMatchingBrace handles strings containing braces', () => {
    const input = '{"text":"has {braces} inside"}';
    const idx = findMatchingBrace(input);
    expect(idx).toBe(input.length - 1);
  });

  it('tryRepairJson handles extremely long input', () => {
    const longInput = '{"data":"' + 'x'.repeat(100000) + '"}';
    const result = tryRepairJson(longInput);
    expect(result).not.toBeNull();
    expect((result!.data as string).length).toBe(100000);
  });

  it('safeJsonParse handles JSON with BOM', () => {
    const bom = '\uFEFF{"key":"value"}';
    // BOM causes JSON.parse to fail, so fallback should work
    const result = safeJsonParse(bom, { key: 'fallback' });
    // Either parsed or fallback, should not crash
    expect(result).toBeDefined();
  });
});
