import { describe, it, expect } from 'vitest';
import { generateProjectContext } from './generateProjectContext';
import type { MasterNote, LogEntry } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMasterNote(overrides: Partial<MasterNote> = {}): MasterNote {
  return {
    id: 'mn-1',
    projectId: 'proj-1',
    overview: 'A project for building a logging tool.',
    currentStatus: '',
    decisions: [
      { text: 'Use localStorage', sourceLogIds: ['log-1'] },
      { text: 'SPA-only architecture', sourceLogIds: ['log-2'] },
    ],
    openIssues: [
      { text: 'Large log performance is poor', sourceLogIds: ['log-1'] },
    ],
    nextActions: [
      { text: 'Implement search feature', sourceLogIds: ['log-2'] },
    ],
    relatedLogIds: ['log-1', 'log-2'],
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    createdAt: '2026-03-13T00:00:00Z',
    title: 'Session 1',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateProjectContext', () => {
  // 1. Generates ProjectContext from a MasterNote with all fields
  it('generates ProjectContext from a MasterNote with all fields', () => {
    const mn = makeMasterNote();
    const logs: LogEntry[] = [
      makeLog({ id: 'log-1', constraints: ['TypeScript strict mode'] }),
      makeLog({ id: 'log-2', constraints: ['Express.js backend'] }),
    ];

    const ctx = generateProjectContext(mn, logs, 'ThreadLog');

    expect(ctx.projectId).toBe('proj-1');
    expect(ctx.projectName).toBe('ThreadLog');
    expect(ctx.overview).toBe('A project for building a logging tool.');
    expect(ctx.currentState).toEqual([]);
    // MasterNote decisions + no decisionRationales from logs (logs have no decisionRationales)
    expect(ctx.keyDecisions.length).toBeGreaterThanOrEqual(2);
    expect(ctx.keyDecisions.some(d => d.decision === 'Use localStorage')).toBe(true);
    expect(ctx.keyDecisions.some(d => d.decision === 'SPA-only architecture')).toBe(true);
    expect(ctx.constraints).toContain('TypeScript strict mode');
    expect(ctx.constraints).toContain('Express.js backend');
    expect(ctx.openIssues).toContain('Large log performance is poor');
    expect(ctx.nextActions).toContain('Implement search feature');
    expect(ctx.sourceLogIds).toEqual(['log-1', 'log-2']);
    expect(ctx.generatedAt).toBeGreaterThan(0);
  });

  // 2. Collects decisionRationales from related logs
  it('collects decisionRationales from related logs', () => {
    const mn = makeMasterNote({ decisions: [] });
    const logs: LogEntry[] = [
      makeLog({
        id: 'log-1',
        decisionRationales: [
          { decision: 'Use Redis for cache', rationale: 'Speed is critical' },
        ],
      }),
      makeLog({
        id: 'log-2',
        decisionRationales: [
          { decision: 'Deploy to AWS', rationale: 'Team expertise' },
        ],
      }),
    ];

    const ctx = generateProjectContext(mn, logs, 'TestProject');

    expect(ctx.keyDecisions).toHaveLength(2);
    expect(ctx.keyDecisions[0]).toEqual({ decision: 'Use Redis for cache', rationale: 'Speed is critical' });
    expect(ctx.keyDecisions[1]).toEqual({ decision: 'Deploy to AWS', rationale: 'Team expertise' });
  });

  // 3. Falls back to decisions when decisionRationales is absent
  it('falls back to decisions when decisionRationales is absent', () => {
    const mn = makeMasterNote({ decisions: [] });
    const logs: LogEntry[] = [
      makeLog({
        id: 'log-1',
        decisionRationales: undefined,
        decisions: ['Use PostgreSQL', 'Monorepo structure'],
      }),
    ];

    const ctx = generateProjectContext(mn, logs, 'TestProject');

    expect(ctx.keyDecisions).toHaveLength(2);
    expect(ctx.keyDecisions[0]).toEqual({ decision: 'Use PostgreSQL', rationale: null });
    expect(ctx.keyDecisions[1]).toEqual({ decision: 'Monorepo structure', rationale: null });
  });

  // 4. Deduplicates decisions across MasterNote and logs
  it('deduplicates decisions across MasterNote and logs', () => {
    const mn = makeMasterNote({
      decisions: [
        { text: 'Use localStorage', sourceLogIds: ['log-1'] },
      ],
    });
    const logs: LogEntry[] = [
      makeLog({
        id: 'log-1',
        decisionRationales: [
          { decision: 'Use localStorage', rationale: 'No backend needed' },
          { decision: 'Use React', rationale: 'Team familiarity' },
        ],
      }),
    ];

    const ctx = generateProjectContext(mn, logs, 'TestProject');

    // "Use localStorage" appears in both MasterNote and log, should be deduped
    const localStorageDecisions = ctx.keyDecisions.filter(
      d => d.decision.toLowerCase() === 'use localstorage',
    );
    expect(localStorageDecisions).toHaveLength(1);
    expect(ctx.keyDecisions.some(d => d.decision === 'Use React')).toBe(true);
  });

  // 5. Deduplicates constraints
  it('deduplicates constraints from multiple logs', () => {
    const mn = makeMasterNote();
    const logs: LogEntry[] = [
      makeLog({ id: 'log-1', constraints: ['TypeScript strict mode', 'No backend'] }),
      makeLog({ id: 'log-2', constraints: ['TypeScript strict mode', 'Express.js only'] }),
    ];

    const ctx = generateProjectContext(mn, logs, 'TestProject');

    const tsConstraints = ctx.constraints.filter(c => c === 'TypeScript strict mode');
    expect(tsConstraints).toHaveLength(1);
    expect(ctx.constraints).toContain('No backend');
    expect(ctx.constraints).toContain('Express.js only');
  });

  // 6. Handles empty MasterNote gracefully
  it('handles empty MasterNote gracefully', () => {
    const mn = makeMasterNote({
      overview: '',
      currentStatus: '',
      decisions: [],
      openIssues: [],
      nextActions: [],
      relatedLogIds: [],
    });
    const logs: LogEntry[] = [];

    const ctx = generateProjectContext(mn, logs, 'EmptyProject');

    expect(ctx.projectId).toBe('proj-1');
    expect(ctx.projectName).toBe('EmptyProject');
    expect(ctx.overview).toBe('');
    expect(ctx.currentState).toEqual([]);
    expect(ctx.keyDecisions).toEqual([]);
    expect(ctx.constraints).toEqual([]);
    expect(ctx.openIssues).toEqual([]);
    expect(ctx.nextActions).toEqual([]);
    expect(ctx.sourceLogIds).toEqual([]);
  });
});
