import { describe, it, expect } from 'vitest';
import { matchesLogQuery, search } from './search';
import type { LogEntry, Project, Todo, MasterNote } from './types';

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    title: 'Test Log',
    today: ['Did some work'],
    decisions: ['Decided X'],
    todo: ['Fix bug'],
    relatedProjects: [],
    tags: ['react'],
    createdAt: Date.now(),
    outputMode: 'worklog',
    ...overrides,
  } as LogEntry;
}

describe('matchesLogQuery', () => {
  it('matches title', () => {
    const log = makeLog({ title: 'Deploy Pipeline Fix' });
    expect(matchesLogQuery(log, 'deploy')).toBe(true);
    expect(matchesLogQuery(log, 'pipeline')).toBe(true);
  });

  it('matches case-insensitively', () => {
    const log = makeLog({ title: 'React Component' });
    expect(matchesLogQuery(log, 'react')).toBe(true);
    expect(matchesLogQuery(log, 'REACT')).toBe(true);
  });

  it('matches today items', () => {
    const log = makeLog({ today: ['Fixed authentication bug'] });
    expect(matchesLogQuery(log, 'authentication')).toBe(true);
  });

  it('matches decisions', () => {
    const log = makeLog({ decisions: ['Use PostgreSQL'] });
    expect(matchesLogQuery(log, 'postgresql')).toBe(true);
  });

  it('matches tags', () => {
    const log = makeLog({ tags: ['backend', 'api'] });
    expect(matchesLogQuery(log, 'backend')).toBe(true);
  });

  it('matches memo', () => {
    const log = makeLog({ memo: 'Important note about caching' });
    expect(matchesLogQuery(log, 'caching')).toBe(true);
  });

  it('matches handoff fields', () => {
    const log = makeLog({
      currentStatus: ['API is ready'],
      nextActions: ['Write tests'],
      blockers: ['Waiting on design'],
    });
    expect(matchesLogQuery(log, 'api is ready')).toBe(true);
    expect(matchesLogQuery(log, 'write tests')).toBe(true);
    expect(matchesLogQuery(log, 'waiting on design')).toBe(true);
  });

  it('does not match unrelated query', () => {
    const log = makeLog({ title: 'Frontend work' });
    expect(matchesLogQuery(log, 'kubernetes')).toBe(false);
  });
});

describe('search', () => {
  const project: Project = {
    id: 'proj-1',
    name: 'Lore App',
    createdAt: Date.now(),
  } as Project;

  const log = makeLog({ title: 'Sidebar redesign', projectId: 'proj-1' });

  const todo: Todo = {
    id: 'todo-1',
    text: 'Add sidebar animation',
    done: false,
    logId: 'log-1',
    createdAt: Date.now(),
  } as Todo;

  const masterNote: MasterNote = {
    id: 'mn-1',
    projectId: 'proj-1',
    overview: 'Lore is a worklog tool',
    currentStatus: 'Building sidebar',
    decisions: [{ text: 'Use React' }],
    openIssues: [],
    nextActions: [],
    updatedAt: Date.now(),
  } as unknown as MasterNote;

  const projectMap = new Map([['proj-1', project]]);

  const data = {
    logs: [log],
    projects: [project],
    todos: [todo],
    masterNotes: [masterNote],
    projectMap,
  };

  it('returns empty for empty query', () => {
    expect(search('', data)).toEqual([]);
    expect(search('  ', data)).toEqual([]);
  });

  it('finds projects by name', () => {
    const results = search('lore', data);
    expect(results.some((r) => r.type === 'project' && r.id === 'proj-1')).toBe(true);
  });

  it('finds logs by title', () => {
    const results = search('sidebar', data);
    expect(results.some((r) => r.type === 'log' && r.id === 'log-1')).toBe(true);
  });

  it('finds todos by text', () => {
    const results = search('animation', data);
    expect(results.some((r) => r.type === 'todo' && r.id === 'todo-1')).toBe(true);
  });

  it('finds master notes by content', () => {
    const results = search('worklog tool', data);
    expect(results.some((r) => r.type === 'summary')).toBe(true);
  });

  it('respects limit', () => {
    const manyLogs = Array.from({ length: 50 }, (_, i) =>
      makeLog({ id: `log-${i}`, title: `Test log ${i}` })
    );
    const results = search('test', { ...data, logs: manyLogs }, 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
