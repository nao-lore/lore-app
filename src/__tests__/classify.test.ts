/**
 * classify.test.ts — Unit tests for the classify module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

// Mock callProvider before importing classify
vi.mock('../provider', () => ({
  callProvider: vi.fn(),
  shouldUseBuiltinApi: vi.fn(() => false),
}));

import { classifyLog, loadCorrections, saveCorrection } from '../classify';
import { callProvider } from '../provider';
import type { LogEntry, Project } from '../types';

const mockCallProvider = vi.mocked(callProvider);

function makeProject(name: string, id?: string): Project {
  return { id: id || crypto.randomUUID(), name, createdAt: Date.now() };
}

function makeLogInput(title: string, tags: string[] = []) {
  return {
    title,
    today: [],
    decisions: [],
    todo: [],
    tags,
    relatedProjects: [],
  };
}

describe('classify — LRU cache', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('returns cached result for same input (no second API call)', async () => {
    const project = makeProject('My Project', 'proj-1');
    store.set('threadlog_api_key_gemini', 'fake-key');
    store.set('threadlog_provider', 'gemini');

    mockCallProvider.mockResolvedValue('{"projectId": "proj-1", "confidence": 0.9}');

    const log = makeLogInput('Test classification', ['react']);

    const result1 = await classifyLog(log, [project]);
    expect(result1.projectId).toBe('proj-1');
    expect(result1.confidence).toBe(0.9);
    expect(mockCallProvider).toHaveBeenCalledTimes(1);

    // Second call with same input should use cache
    const result2 = await classifyLog(log, [project]);
    expect(result2.projectId).toBe('proj-1');
    expect(result2.confidence).toBe(0.9);
    // Should NOT have called the API again
    expect(mockCallProvider).toHaveBeenCalledTimes(1);
  });

  it('evicts oldest entry when cache is full', async () => {
    store.set('threadlog_api_key_gemini', 'fake-key');
    store.set('threadlog_provider', 'gemini');

    mockCallProvider.mockResolvedValue('{"projectId": null, "confidence": 0}');

    // Fill cache beyond 50 entries with unique inputs
    const projects = [makeProject('P', 'p-1')];
    for (let i = 0; i < 52; i++) {
      const log = makeLogInput(`Unique title ${i}`, [`tag-${i}`]);
      await classifyLog(log, projects);
    }

    // All 52 calls should have hit the API (each unique)
    expect(mockCallProvider).toHaveBeenCalledTimes(52);

    // Calling with the very first input again should miss cache (evicted)
    const firstLog = makeLogInput('Unique title 0', ['tag-0']);
    await classifyLog(firstLog, projects);
    expect(mockCallProvider).toHaveBeenCalledTimes(53);
  });
});

describe('classify — corrections', () => {
  beforeEach(() => {
    store.clear();
  });

  it('saveCorrection stores corrections in localStorage', () => {
    expect(loadCorrections()).toHaveLength(0);

    const log = {
      id: 'log-1',
      title: 'Test Log',
      tags: ['react', 'frontend'],
    } as LogEntry;

    saveCorrection(log, 'proj-1');

    const corrections = loadCorrections();
    expect(corrections).toHaveLength(1);
    expect(corrections[0].title).toBe('Test Log');
    expect(corrections[0].tags).toEqual(['react', 'frontend']);
    expect(corrections[0].projectId).toBe('proj-1');
  });

  it('saveCorrection limits to 50 corrections', () => {
    const log = { id: 'log-1', title: 'Log', tags: [] } as unknown as LogEntry;

    // Add 55 corrections
    for (let i = 0; i < 55; i++) {
      saveCorrection({ ...log, title: `Log ${i}` } as LogEntry, `proj-${i}`);
    }

    const corrections = loadCorrections();
    expect(corrections).toHaveLength(50);
    // Should have kept the latest 50 (indices 5-54)
    expect(corrections[0].title).toBe('Log 5');
    expect(corrections[49].title).toBe('Log 54');
  });
});
