import { describe, it, expect } from 'vitest';
import { normalizeNextActions, normalizeResumeChecklist, normalizeHandoffMeta, normalizeActionBacklog, buildHandoffLogEntry } from '../transform';
import { formatHandoffMarkdown, formatFullAiContext } from '../formatHandoff';
import type { LogEntry, NextActionItem, HandoffResult, ProjectContext } from '../types';

describe('normalizeNextActions', () => {
  // 1. Legacy fallback: string[] input
  describe('legacy string[] input', () => {
    it('wraps strings as NextActionItem with null fields', () => {
      const input = ['Fix bug in auth.ts', 'Add tests for utils'];
      const { nextActions, nextActionItems } = normalizeNextActions(input);

      expect(nextActions).toEqual(['Fix bug in auth.ts', 'Add tests for utils']);
      expect(nextActionItems).toEqual([
        { action: 'Fix bug in auth.ts', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null },
        { action: 'Add tests for utils', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null },
      ]);
    });

    it('filters out empty strings', () => {
      const input = ['Valid action', '', '  '];
      const { nextActions, nextActionItems } = normalizeNextActions(input);

      expect(nextActions).toHaveLength(1);
      expect(nextActionItems).toHaveLength(1);
      expect(nextActions[0]).toBe('Valid action');
    });
  });

  // 2. Structured input: object[] with all fields
  describe('structured object[] input', () => {
    it('extracts all fields correctly', () => {
      const input = [
        { action: 'Fix Chrome extension post-send UI', whyImportant: 'UXが壊れているため', priorityReason: 'リリースブロッカー', dueBy: '今日中', dependsOn: ['sendMessage()の修正'] },
        { action: 'Add rate limiting', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null },
      ];
      const { nextActions, nextActionItems } = normalizeNextActions(input);

      expect(nextActions).toEqual(['Fix Chrome extension post-send UI', 'Add rate limiting']);
      expect(nextActionItems[0]).toEqual({
        action: 'Fix Chrome extension post-send UI',
        whyImportant: 'UXが壊れているため',
        priorityReason: 'リリースブロッカー',
        dueBy: '今日中',
        dependsOn: ['sendMessage()の修正'],
      });
      expect(nextActionItems[1]).toEqual({
        action: 'Add rate limiting',
        whyImportant: null,
        priorityReason: null,
        dueBy: null,
        dependsOn: null,
      });
    });

    it('filters out items with empty action', () => {
      const input = [
        { action: 'Valid', whyImportant: null, dueBy: null },
        { action: '', whyImportant: 'reason', dueBy: 'tomorrow' },
      ];
      const { nextActions, nextActionItems } = normalizeNextActions(input);

      expect(nextActions).toHaveLength(1);
      expect(nextActionItems).toHaveLength(1);
    });
  });

  // 3. Order consistency: nextActions[i] === nextActionItems[i].action
  describe('order consistency (source of truth = nextActionItems)', () => {
    it('nextActions is always derived from nextActionItems.map(i => i.action)', () => {
      const input = [
        { action: 'First task', whyImportant: 'reason1', priorityReason: 'blocker', dueBy: 'today', dependsOn: null },
        { action: 'Second task', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: ['First task'] },
        { action: 'Third task', whyImportant: 'reason3', priorityReason: null, dueBy: 'tomorrow', dependsOn: null },
      ];
      const { nextActions, nextActionItems } = normalizeNextActions(input);

      expect(nextActions).toHaveLength(nextActionItems.length);
      for (let i = 0; i < nextActions.length; i++) {
        expect(nextActions[i]).toBe(nextActionItems[i].action);
      }
    });

    it('maintains order with string[] input too', () => {
      const input = ['A', 'B', 'C'];
      const { nextActions, nextActionItems } = normalizeNextActions(input);

      expect(nextActions).toHaveLength(nextActionItems.length);
      for (let i = 0; i < nextActions.length; i++) {
        expect(nextActions[i]).toBe(nextActionItems[i].action);
      }
    });
  });

  // 4. Null handling
  describe('null handling', () => {
    it('coerces missing fields to null', () => {
      const input = [{ action: 'Some task' }];
      const { nextActionItems } = normalizeNextActions(input);

      expect(nextActionItems[0].whyImportant).toBeNull();
      expect(nextActionItems[0].priorityReason).toBeNull();
      expect(nextActionItems[0].dueBy).toBeNull();
      expect(nextActionItems[0].dependsOn).toBeNull();
    });

    it('coerces non-string scalars to null', () => {
      const input = [{ action: 'Task', whyImportant: 123, priorityReason: true, dueBy: {}, dependsOn: 'not-array' }];
      const { nextActionItems } = normalizeNextActions(input as unknown[]);

      expect(nextActionItems[0].whyImportant).toBeNull();
      expect(nextActionItems[0].priorityReason).toBeNull();
      expect(nextActionItems[0].dueBy).toBeNull();
      expect(nextActionItems[0].dependsOn).toBeNull();
    });

    it('filters empty strings from dependsOn', () => {
      const input = [{ action: 'Task', dependsOn: ['valid', '', '  '] }];
      const { nextActionItems } = normalizeNextActions(input);

      expect(nextActionItems[0].dependsOn).toEqual(['valid']);
    });

    it('returns null dependsOn for empty array', () => {
      const input = [{ action: 'Task', dependsOn: [] }];
      const { nextActionItems } = normalizeNextActions(input);

      expect(nextActionItems[0].dependsOn).toBeNull();
    });

    it('returns empty arrays for empty input', () => {
      const { nextActions, nextActionItems } = normalizeNextActions([]);
      expect(nextActions).toEqual([]);
      expect(nextActionItems).toEqual([]);
    });

    it('returns empty arrays for non-array input', () => {
      const { nextActions, nextActionItems } = normalizeNextActions(null as unknown as unknown[]);
      expect(nextActions).toEqual([]);
      expect(nextActionItems).toEqual([]);
    });
  });

  // 5. Formatter output
  describe('formatter', () => {
    const makeLog = (items: NextActionItem[]): LogEntry => ({
      id: 'test',
      createdAt: '2026-01-01',
      title: 'Test',
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
      outputMode: 'handoff',
      currentStatus: ['State A'],
      nextActions: items.map(i => i.action),
      nextActionItems: items,
      completed: ['Done X'],
      blockers: [],
      constraints: [],
      resumeContext: [],
    });

    it('renders all sub-fields when present', () => {
      const md = formatHandoffMarkdown(makeLog([{
        action: 'Fix merge logic',
        whyImportant: 'データが消えるため',
        priorityReason: 'UIテストがブロックされている',
        dueBy: '今日中',
        dependsOn: ['normalizeNextActions()のリファクタ'],
      }]));

      expect(md).toContain('- Fix merge logic');
      expect(md).toContain('Why: データが消えるため');
      expect(md).toContain('Priority: UIテストがブロックされている');
      expect(md).toContain('Depends on: normalizeNextActions()のリファクタ');
      expect(md).toContain('Due: 今日中');
    });

    it('renders only present sub-fields', () => {
      const md = formatHandoffMarkdown(makeLog([{
        action: 'Add tests',
        whyImportant: null,
        priorityReason: null,
        dueBy: null,
        dependsOn: null,
      }]));

      expect(md).toContain('- Add tests');
      expect(md).not.toContain('Why:');
      expect(md).not.toContain('Priority:');
      expect(md).not.toContain('Depends on:');
      expect(md).not.toContain('Due:');
    });

    it('renders dependsOn with multiple items comma-separated', () => {
      const md = formatHandoffMarkdown(makeLog([{
        action: 'Wire UI',
        whyImportant: null,
        priorityReason: null,
        dueBy: null,
        dependsOn: ['Task A', 'Task B'],
      }]));

      expect(md).toContain('Depends on: Task A, Task B');
    });

    it('formatFullAiContext also renders priorityReason/dependsOn', () => {
      const ctx: ProjectContext = {
        projectName: 'TestProject',
        overview: '',
        currentState: [],
        keyDecisions: [],
        constraints: [],
        openIssues: [],
        nextActions: [],
      };
      const log = makeLog([{
        action: 'Deploy hotfix',
        whyImportant: 'ユーザー影響あり',
        priorityReason: '本番障害のため最優先',
        dueBy: 'ASAP',
        dependsOn: ['ステージング検証完了'],
      }]);
      const md = formatFullAiContext(ctx, log);

      expect(md).toContain('Priority: 本番障害のため最優先');
      expect(md).toContain('Depends on: ステージング検証完了');
      expect(md).toContain('Due: ASAP');
    });
  });

  // 6. Chunk merge simulation
  describe('chunk merge consistency', () => {
    it('normalizeNextActions preserves all fields', () => {
      const lastChunkData = [
        { action: 'Implement feature X', whyImportant: 'Blocking release', priorityReason: 'Critical path', dueBy: 'Friday', dependsOn: ['Design review'] },
        { action: 'Write tests', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null },
      ];

      const { nextActions, nextActionItems } = normalizeNextActions(lastChunkData);

      expect(nextActions.length).toBe(nextActionItems.length);
      expect(nextActions.length).toBe(2);
      expect(nextActionItems[0].priorityReason).toBe('Critical path');
      expect(nextActionItems[0].dependsOn).toEqual(['Design review']);
      expect(nextActionItems[1].priorityReason).toBeNull();
      expect(nextActionItems[1].dependsOn).toBeNull();
    });

    it('handles mixed chunk results (last chunk is strings)', () => {
      const lastChunkData = ['Task A', 'Task B'];
      const { nextActions, nextActionItems } = normalizeNextActions(lastChunkData);

      expect(nextActions.length).toBe(nextActionItems.length);
      expect(nextActions).toEqual(['Task A', 'Task B']);
      expect(nextActionItems[0]).toEqual({ action: 'Task A', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null });
    });
  });
});

// =============================================================================
// Phase 3: normalizeResumeChecklist
// =============================================================================

describe('normalizeResumeChecklist', () => {
  it('normalizes valid array', () => {
    const input = [
      { action: 'Run tests', whyNow: 'Blocks release', ifSkipped: 'Regression risk' },
      { action: 'Check logs', whyNow: null, ifSkipped: null },
    ];
    const result = normalizeResumeChecklist(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ action: 'Run tests', whyNow: 'Blocks release', ifSkipped: 'Regression risk' });
    expect(result[1]).toEqual({ action: 'Check logs', whyNow: null, ifSkipped: null });
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeResumeChecklist(null)).toEqual([]);
    expect(normalizeResumeChecklist(undefined)).toEqual([]);
    expect(normalizeResumeChecklist('string')).toEqual([]);
  });

  it('filters out items without action', () => {
    const input = [
      { action: 'Valid', whyNow: null, ifSkipped: null },
      { whyNow: 'orphan', ifSkipped: 'orphan' },
      { action: '', whyNow: null, ifSkipped: null },
    ];
    const result = normalizeResumeChecklist(input);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('Valid');
  });

  it('coerces non-string whyNow/ifSkipped to null', () => {
    const input = [{ action: 'Test', whyNow: 123, ifSkipped: true }];
    const result = normalizeResumeChecklist(input);
    expect(result[0].whyNow).toBeNull();
    expect(result[0].ifSkipped).toBeNull();
  });

  it('caps at 3 items (hard limit)', () => {
    const input = Array.from({ length: 5 }, (_, i) => ({ action: `Item ${i}`, whyNow: null, ifSkipped: null }));
    const result = normalizeResumeChecklist(input);
    expect(result).toHaveLength(3);
    expect(result[0].action).toBe('Item 0');
    expect(result[2].action).toBe('Item 2');
  });
});

// =============================================================================
// Phase 3: normalizeHandoffMeta
// =============================================================================

describe('normalizeHandoffMeta', () => {
  it('normalizes valid object', () => {
    const input = { sessionFocus: 'Phase 3 compression', whyThisSession: 'リリース前', timePressure: '3/15までに完了必要' };
    const result = normalizeHandoffMeta(input);
    expect(result).toEqual({ sessionFocus: 'Phase 3 compression', whyThisSession: 'リリース前', timePressure: '3/15までに完了必要' });
  });

  it('returns all-null for non-object input', () => {
    expect(normalizeHandoffMeta(null)).toEqual({ sessionFocus: null, whyThisSession: null, timePressure: null });
    expect(normalizeHandoffMeta(undefined)).toEqual({ sessionFocus: null, whyThisSession: null, timePressure: null });
  });

  it('coerces non-string fields to null', () => {
    const input = { sessionFocus: 42, whyThisSession: true, timePressure: [] };
    const result = normalizeHandoffMeta(input);
    expect(result.sessionFocus).toBeNull();
    expect(result.whyThisSession).toBeNull();
    expect(result.timePressure).toBeNull();
  });
});

// =============================================================================
// Phase 3: normalizeActionBacklog
// =============================================================================

describe('normalizeActionBacklog', () => {
  it('normalizes structured items', () => {
    const input = [
      { action: 'Refactor utils', whyImportant: 'Tech debt', priorityReason: null, dueBy: null, dependsOn: null },
    ];
    const result = normalizeActionBacklog(input);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('Refactor utils');
    expect(result[0].whyImportant).toBe('Tech debt');
  });

  it('wraps strings as NextActionItem', () => {
    const input = ['Task A', 'Task B'];
    const result = normalizeActionBacklog(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ action: 'Task A', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null });
  });

  it('caps at 7 items', () => {
    const input = Array.from({ length: 10 }, (_, i) => `Task ${i}`);
    const result = normalizeActionBacklog(input);
    expect(result).toHaveLength(7);
  });
});

// =============================================================================
// Phase 3: buildHandoffLogEntry
// =============================================================================

describe('buildHandoffLogEntry', () => {
  it('assembles all new fields from HandoffResult', () => {
    const result: HandoffResult = {
      title: 'Test Handoff',
      currentStatus: ['Working on Phase 3'],
      nextActions: ['Run tests'],
      nextActionItems: [{ action: 'Run tests', whyImportant: 'Verify', priorityReason: null, dueBy: null, dependsOn: null }],
      actionBacklog: [{ action: 'Refactor', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }],
      completed: ['Implemented types'],
      blockers: ['API rate limit'],
      decisions: ['Use Gemini'],
      decisionRationales: [{ decision: 'Use Gemini', rationale: 'Cost efficiency' }],
      constraints: ['Budget limit'],
      resumeContext: ['Run tests first'],
      resumeChecklist: [{ action: 'Run tests first', whyNow: 'Blocks deploy', ifSkipped: 'Regression' }],
      handoffMeta: { sessionFocus: 'Phase 3', whyThisSession: 'Deadline approaching', timePressure: '3/15リリース' },
      tags: ['phase3'],
    };

    const entry = buildHandoffLogEntry(result, { projectId: 'proj-1' });

    expect(entry.outputMode).toBe('handoff');
    expect(entry.projectId).toBe('proj-1');
    expect(entry.handoffMeta).toEqual(result.handoffMeta);
    expect(entry.resumeChecklist).toEqual(result.resumeChecklist);
    expect(entry.actionBacklog).toEqual(result.actionBacklog);
    expect(entry.nextActionItems).toEqual(result.nextActionItems);
    expect(entry.resumeContext).toEqual(['Run tests first']);
    // Derived invariant: resumeContext = resumeChecklist.map(x => x.action)
    expect(entry.resumeContext).toEqual(entry.resumeChecklist!.map(x => x.action));
  });

  it('handles missing optional fields gracefully', () => {
    const result: HandoffResult = {
      title: 'Minimal',
      currentStatus: [],
      nextActions: [],
      completed: [],
      blockers: [],
      decisions: [],
      constraints: [],
      resumeContext: [],
      tags: [],
    };

    const entry = buildHandoffLogEntry(result, {});
    expect(entry.handoffMeta).toBeUndefined();
    expect(entry.resumeChecklist).toBeUndefined();
    expect(entry.actionBacklog).toBeUndefined();
  });
});

// =============================================================================
// Phase 3: formatHandoffMarkdown with new fields
// =============================================================================

describe('formatHandoffMarkdown (Phase 3)', () => {
  const makeHandoffLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    id: 'test-1', createdAt: new Date().toISOString(), title: 'Test',
    today: [], decisions: [], todo: [], relatedProjects: [], tags: [],
    outputMode: 'handoff',
    currentStatus: ['Working'], completed: ['Done stuff'],
    nextActions: ['Next task'], blockers: [], constraints: [],
    resumeContext: ['Resume item'],
    ...overrides,
  });

  it('renders handoffMeta as Session Context', () => {
    const log = makeHandoffLog({
      handoffMeta: { sessionFocus: 'Phase 3 impl', whyThisSession: 'Release deadline', timePressure: '3/15までに完了' },
    });
    const md = formatHandoffMarkdown(log);
    expect(md).toContain('### Session Context');
    expect(md).toContain('**Session Focus**: Phase 3 impl');
    expect(md).toContain('**Time Pressure**: 3/15までに完了');
  });

  it('renders structured resumeChecklist over legacy resumeContext', () => {
    const log = makeHandoffLog({
      resumeChecklist: [
        { action: 'テスト実行', whyNow: 'デプロイ前に必須', ifSkipped: 'リグレッション発生' },
      ],
      resumeContext: ['Legacy resume'],
    });
    const md = formatHandoffMarkdown(log);
    expect(md).toContain('テスト実行');
    expect(md).toContain('Why now: デプロイ前に必須');
    expect(md).toContain('If skipped: リグレッション発生');
    expect(md).not.toContain('Legacy resume');
  });

  it('does NOT include actionBacklog in Copy Handoff', () => {
    const log = makeHandoffLog({
      actionBacklog: [{ action: 'Backlog task', whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }],
    });
    const md = formatHandoffMarkdown(log);
    expect(md).not.toContain('Backlog task');
    expect(md).not.toContain('Action Backlog');
  });
});

// =============================================================================
// Phase 3: formatFullAiContext with new fields
// =============================================================================

describe('formatFullAiContext (Phase 3)', () => {
  const ctx: ProjectContext = {
    projectId: 'p1', projectName: 'TestProject', overview: 'Test overview',
    currentState: [], keyDecisions: [], constraints: [], openIssues: [], nextActions: [],
    sourceLogIds: [], generatedAt: Date.now(),
  };

  const makeHandoffLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    id: 'test-1', createdAt: new Date().toISOString(), title: 'Test',
    today: [], decisions: [], todo: [], relatedProjects: [], tags: [],
    outputMode: 'handoff',
    currentStatus: [], completed: [], nextActions: [], blockers: [], constraints: [],
    resumeContext: [],
    ...overrides,
  });

  it('includes actionBacklog in Full Context', () => {
    const log = makeHandoffLog({
      actionBacklog: [{ action: 'Refactor DB layer', whyImportant: 'Tech debt', priorityReason: null, dueBy: null, dependsOn: null }],
    });
    const md = formatFullAiContext(ctx, log);
    expect(md).toContain('Action Backlog');
    expect(md).toContain('Refactor DB layer');
    expect(md).toContain('Why: Tech debt');
  });

  it('renders handoffMeta in session section', () => {
    const log = makeHandoffLog({
      handoffMeta: { sessionFocus: 'API migration', whyThisSession: null, timePressure: 'v2 deprecation April 1' },
    });
    const md = formatFullAiContext(ctx, log);
    expect(md).toContain('Session Context');
    expect(md).toContain('**Session Focus**: API migration');
    expect(md).toContain('**Time Pressure**: v2 deprecation April 1');
  });

  it('renders structured resumeChecklist in session section', () => {
    const log = makeHandoffLog({
      resumeChecklist: [
        { action: 'Verify migration script', whyNow: 'Must run before cutover', ifSkipped: 'Data loss possible' },
      ],
    });
    const md = formatFullAiContext(ctx, log);
    expect(md).toContain('Verify migration script');
    expect(md).toContain('Why now: Must run before cutover');
    expect(md).toContain('If skipped: Data loss possible');
  });
});

// =============================================================================
// Phase 3: nextActions max 4 overflow to actionBacklog
// =============================================================================

describe('nextActions overflow cap', () => {
  it('transformHandoff-style overflow: >4 nextActions spill to actionBacklog', async () => {
    // Simulate what transformHandoff does after normalizeNextActions
    const { normalizeNextActions: norm, normalizeActionBacklog: normBacklog } = await import('../transform');
    const raw = Array.from({ length: 8 }, (_, i) => ({
      action: `Task ${i}`, whyImportant: `Reason ${i}`, priorityReason: null, dueBy: null, dependsOn: null,
    }));
    let { nextActions, nextActionItems } = norm(raw);
    let actionBacklog = normBacklog([]);

    // Apply the same cap as transform.ts
    if (nextActionItems.length > 4) {
      const overflow = nextActionItems.slice(4);
      nextActionItems = nextActionItems.slice(0, 4);
      nextActions = nextActionItems.map(i => i.action);
      actionBacklog = [...overflow, ...actionBacklog].slice(0, 7);
    }

    expect(nextActionItems).toHaveLength(4);
    expect(nextActions).toHaveLength(4);
    expect(actionBacklog).toHaveLength(4); // 8 - 4 = 4 overflow
    expect(nextActions[0]).toBe('Task 0');
    expect(actionBacklog[0].action).toBe('Task 4');
  });

  it('overflow merges with existing backlog, capped at 7', async () => {
    const { normalizeNextActions: norm, normalizeActionBacklog: normBacklog } = await import('../transform');
    const raw = Array.from({ length: 10 }, (_, i) => ({
      action: `Next ${i}`, whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null,
    }));
    const existingBacklog = Array.from({ length: 5 }, (_, i) => `Backlog ${i}`);
    let { nextActionItems } = norm(raw);
    let actionBacklog = normBacklog(existingBacklog);

    if (nextActionItems.length > 4) {
      const overflow = nextActionItems.slice(4);
      nextActionItems = nextActionItems.slice(0, 4);
      actionBacklog = [...overflow, ...actionBacklog].slice(0, 7);
    }

    expect(nextActionItems).toHaveLength(4);
    expect(actionBacklog).toHaveLength(7); // 6 overflow + 5 existing = 11, capped at 7
    // Overflow items come first (higher priority since they were in nextActions)
    expect(actionBacklog[0].action).toBe('Next 4');
  });
});
