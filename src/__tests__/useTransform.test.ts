/**
 * useTransform.test.ts — Unit tests for the useTransform hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mock storage ──
vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    loadLogs: () => [],
    loadProjects: () => [],
    addLog: vi.fn(),
    getLog: vi.fn(),
    addTodosFromLog: vi.fn(),
    addTodosFromLogWithMeta: vi.fn(),
    updateLog: vi.fn(),
    getApiKey: () => 'test-key',
    getFeatureEnabled: () => true,
    getMasterNote: () => null,
    isDemoMode: vi.fn(() => false),
    safeGetItem: () => null,
    safeSetItem: vi.fn(),
    safeRemoveItem: vi.fn(),
    getStreak: () => 0,
    recordActivity: vi.fn(),
    getLang: () => 'en',
  };
});

// ── Mock provider ──
vi.mock('../provider', () => ({
  shouldUseBuiltinApi: () => false,
  callProvider: vi.fn(),
  callProviderStream: vi.fn(),
}));

// ── Mock classify ──
vi.mock('../classify', () => ({
  classifyLog: vi.fn().mockResolvedValue({ projectId: null, confidence: 0 }),
  saveCorrection: vi.fn(),
}));

// ── Mock sounds ──
vi.mock('../sounds', () => ({
  playSuccess: vi.fn(),
}));

// ── Mock formatHandoff ──
vi.mock('../formatHandoff', () => ({
  formatHandoffMarkdown: () => '# Handoff',
  formatFullAiContext: () => '# Context',
}));

// ── Mock generateProjectContext ──
vi.mock('../generateProjectContext', () => ({
  generateProjectContext: () => ({}),
}));

// ── Mock demoData (lazy-loaded) ──
const mockDemoHandoff = vi.fn().mockResolvedValue({
  title: 'Demo Handoff',
  handoffMeta: { sessionFocus: null, whyThisSession: null, timePressure: null },
  currentStatus: ['Status A'],
  resumeChecklist: [],
  resumeContext: [],
  nextActions: ['Action 1'],
  nextActionItems: [{ action: 'Action 1', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }],
  completed: ['Done A'],
  blockers: [],
  decisions: [],
  decisionRationales: [],
  constraints: [],
  tags: ['demo'],
});

const mockDemoText = vi.fn().mockResolvedValue({
  title: 'Demo Worklog',
  today: ['Did A'],
  decisions: [],
  todo: ['Do B'],
  relatedProjects: [],
  tags: ['demo'],
});

const mockDemoBoth = vi.fn().mockResolvedValue({
  worklog: {
    title: 'Demo Both Worklog',
    today: ['Did A'],
    decisions: [],
    todo: ['Do B'],
    relatedProjects: [],
    tags: ['demo'],
  },
  handoff: {
    title: 'Demo Both Handoff',
    handoffMeta: { sessionFocus: null, whyThisSession: null, timePressure: null },
    currentStatus: ['Status A'],
    resumeChecklist: [],
    resumeContext: [],
    nextActions: ['Action 1'],
    nextActionItems: [{ action: 'Action 1', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }],
    completed: ['Done A'],
    blockers: [],
    decisions: [],
    decisionRationales: [],
    constraints: [],
    tags: ['demo'],
  },
});

const mockDemoTodoOnly = vi.fn().mockResolvedValue({
  todos: [{ title: 'Demo TODO', priority: 'medium' }],
});

const mockDemoHandoffTodo = vi.fn().mockResolvedValue({
  handoff: {
    title: 'Demo HT',
    handoffMeta: { sessionFocus: null, whyThisSession: null, timePressure: null },
    currentStatus: ['Status A'],
    resumeChecklist: [],
    resumeContext: [],
    nextActions: ['Action 1'],
    nextActionItems: [{ action: 'Action 1', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }],
    completed: [],
    blockers: [],
    decisions: [],
    decisionRationales: [],
    constraints: [],
    tags: ['demo'],
  },
  todos: [{ title: 'Demo TODO', priority: 'high', dueDate: null }],
});

vi.mock('../demoData', () => ({
  default: undefined,
  getDemoConversation: () => 'Demo conversation',
  demoTransformBoth: (...args: unknown[]) => mockDemoBoth(...args),
  demoTransformHandoff: (...args: unknown[]) => mockDemoHandoff(...args),
  demoTransformText: (...args: unknown[]) => mockDemoText(...args),
  demoTransformTodoOnly: (...args: unknown[]) => mockDemoTodoOnly(...args),
  demoTransformHandoffTodo: (...args: unknown[]) => mockDemoHandoffTodo(...args),
}));

// ── Mock transform ──
vi.mock('../transform', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    transformText: vi.fn().mockRejectedValue(new Error('[API Error] mock')),
    transformHandoff: vi.fn().mockRejectedValue(new Error('[API Error] mock')),
    transformBoth: vi.fn().mockRejectedValue(new Error('[API Error] mock')),
    transformTodoOnly: vi.fn().mockRejectedValue(new Error('[API Error] mock')),
    transformHandoffTodo: vi.fn().mockRejectedValue(new Error('[API Error] mock')),
  };
});

import { useTransform, djb2Hash } from '../hooks/useTransform';
import type { Project } from '../types';
import * as storage from '../storage';

function makeParams(overrides: Partial<Parameters<typeof useTransform>[0]> = {}) {
  return {
    lang: 'en' as const,
    selectedProjectId: undefined,
    projects: [] as Project[],
    combined: 'User: hello\nAssistant: hi',
    text: 'User: hello\nAssistant: hi',
    files: [],
    willChunk: false,
    onSaved: vi.fn(),
    showToast: vi.fn(),
    buildSourceReference: vi.fn().mockReturnValue({}),
    ...overrides,
  };
}

describe('djb2Hash', () => {
  it('returns a string', () => {
    const hash = djb2Hash('hello world');
    expect(typeof hash).toBe('string');
  });

  it('returns consistent results for same input', () => {
    expect(djb2Hash('test')).toBe(djb2Hash('test'));
  });

  it('returns different results for different inputs', () => {
    expect(djb2Hash('hello')).not.toBe(djb2Hash('world'));
  });

  it('handles empty string', () => {
    const hash = djb2Hash('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('handles long strings efficiently', () => {
    const longStr = 'a'.repeat(100000);
    const hash = djb2Hash(longStr);
    expect(typeof hash).toBe('string');
    // Hash should be short (base36 encoded 32-bit integer)
    expect(hash.length).toBeLessThan(10);
  });

  it('produces base36 output', () => {
    const hash = djb2Hash('test string');
    // base36 only uses [0-9a-z]
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });
});

describe('useTransform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes expected properties', () => {
    const { result } = renderHook(() => useTransform(makeParams()));
    const hook = result.current;

    // State properties
    expect(hook).toHaveProperty('result');
    expect(hook).toHaveProperty('savedResult');
    expect(hook).toHaveProperty('error');
    expect(hook).toHaveProperty('loading');
    expect(hook).toHaveProperty('progress');
    expect(hook).toHaveProperty('simStep');
    expect(hook).toHaveProperty('streamDetail');
    expect(hook).toHaveProperty('savedId');
    expect(hook).toHaveProperty('savedHandoffId');
    expect(hook).toHaveProperty('outputMode');
    expect(hook).toHaveProperty('transformAction');

    // Action functions
    expect(typeof hook.runTransform).toBe('function');
    expect(typeof hook.handlePauseResume).toBe('function');
    expect(typeof hook.handleCancel).toBe('function');
    expect(typeof hook.handleAcceptSuggestion).toBe('function');
    expect(typeof hook.handleDismissSuggestion).toBe('function');
    expect(typeof hook.handlePostSaveAssign).toBe('function');
    expect(typeof hook.resetTransformState).toBe('function');
  });

  it('demo mode returns sample data without API call', async () => {
    vi.mocked(storage.isDemoMode).mockReturnValue(true);

    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useTransform(makeParams({ onSaved }))
    );

    await act(async () => {
      await result.current.runTransform('handoff');
    });

    // Should have called the demo function, not the real API
    expect(mockDemoHandoff).toHaveBeenCalled();
    // Should have saved a log entry
    expect(storage.addLog).toHaveBeenCalled();
    // Result should be set
    expect(result.current.result).not.toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('demo mode handoff_todo returns data without API call', async () => {
    vi.mocked(storage.isDemoMode).mockReturnValue(true);

    const { result } = renderHook(() =>
      useTransform(makeParams())
    );

    await act(async () => {
      await result.current.runTransform('handoff_todo');
    });

    expect(mockDemoHandoffTodo).toHaveBeenCalled();
    expect(result.current.result).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets error on API failure', async () => {
    vi.mocked(storage.isDemoMode).mockReturnValue(false);

    const { result } = renderHook(() =>
      useTransform(makeParams())
    );

    await act(async () => {
      await result.current.runTransform('handoff');
    });

    // Should set an error (the mock rejects with [API Error])
    expect(result.current.error).not.toBe('');
    expect(result.current.loading).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('sets error on worklog API failure', async () => {
    vi.mocked(storage.isDemoMode).mockReturnValue(false);

    const { result } = renderHook(() =>
      useTransform(makeParams())
    );

    await act(async () => {
      await result.current.runTransform('worklog');
    });

    expect(result.current.error).not.toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('prevents transform on empty input', async () => {
    const { result } = renderHook(() =>
      useTransform(makeParams({ combined: '', text: '' }))
    );

    await act(async () => {
      await result.current.runTransform('handoff');
    });

    // Should set error for empty input
    expect(result.current.error).not.toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('resetTransformState clears all state', async () => {
    vi.mocked(storage.isDemoMode).mockReturnValue(true);

    const { result } = renderHook(() =>
      useTransform(makeParams())
    );

    // Run a transform first
    await act(async () => {
      await result.current.runTransform('handoff');
    });
    expect(result.current.result).not.toBeNull();

    // Reset
    act(() => {
      result.current.resetTransformState();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.savedResult).toBeNull();
    expect(result.current.savedId).toBeNull();
    expect(result.current.error).toBe('');
  });
});
