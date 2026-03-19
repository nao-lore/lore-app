import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandoffResult } from '../types';

// Mock storage and aiMetrics before importing
vi.mock('../storage', () => {
  const store = new Map<string, string>();
  return {
    safeGetItem: (key: string) => store.get(key) ?? null,
    safeSetItem: (key: string, val: string) => store.set(key, val),
  };
});

vi.mock('../aiMetrics', () => ({
  recordMetric: vi.fn(),
}));

function makeHandoff(overrides: Partial<HandoffResult> = {}): HandoffResult {
  return {
    title: 'Test Handoff',
    currentStatus: ['System is running'],
    nextActions: ['Fix the bug'],
    nextActionItems: [{ action: 'Fix the bug', whyImportant: 'Critical', priorityReason: null, dueBy: null, dependsOn: null }],
    completed: ['Set up project'],
    blockers: [],
    decisions: ['Use PostgreSQL'],
    decisionRationales: [{ decision: 'Use PostgreSQL', rationale: 'JOIN support' }],
    constraints: [],
    resumeContext: ['Check tests'],
    resumeChecklist: [{ action: 'Check tests', whyNow: 'Tests may be broken', ifSkipped: 'Bugs in production' }],
    handoffMeta: { sessionFocus: 'Bug fix', whyThisSession: 'Critical path', timePressure: null },
    tags: ['development', 'PostgreSQL'],
    ...overrides,
  };
}

describe('assessOutputQuality', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns high score for complete handoff', async () => {
    const { assessOutputQuality } = await import('../utils/qualityMetrics');
    const result = makeHandoff();
    const score = assessOutputQuality('a'.repeat(1000), result);
    expect(score.score).toBeGreaterThanOrEqual(80);
    expect(score.hasDecisions).toBe(true);
    expect(score.hasNextActions).toBe(true);
    expect(score.hasResumeChecklist).toBe(true);
    expect(score.whyNowFilled).toBe(1);
  });

  it('returns lower score for empty handoff', async () => {
    const { assessOutputQuality } = await import('../utils/qualityMetrics');
    const result = makeHandoff({
      decisions: [],
      nextActions: [],
      nextActionItems: [],
      resumeChecklist: [],
      currentStatus: [],
      completed: [],
    });
    const score = assessOutputQuality('a'.repeat(1000), result);
    expect(score.score).toBeLessThan(40);
    expect(score.hasDecisions).toBe(false);
    expect(score.hasNextActions).toBe(false);
    expect(score.hasResumeChecklist).toBe(false);
  });

  it('gives partial credit for trivial input', async () => {
    const { assessOutputQuality } = await import('../utils/qualityMetrics');
    const result = makeHandoff({
      decisions: [],
      nextActions: [],
      nextActionItems: [],
      resumeChecklist: [],
    });
    const score = assessOutputQuality('short', result);
    // Trivial input gets partial credit for missing fields
    expect(score.score).toBeGreaterThan(0);
    expect(score.breakdown.decisions).toBe(15); // partial credit for trivial
  });

  it('scores whyNow quality correctly', async () => {
    const { assessOutputQuality } = await import('../utils/qualityMetrics');
    const result = makeHandoff({
      resumeChecklist: [
        { action: 'Check A', whyNow: 'Important', ifSkipped: 'Bad' },
        { action: 'Check B', whyNow: '', ifSkipped: 'Bad' },
        { action: 'Check C', whyNow: 'Needed', ifSkipped: 'Bad' },
      ],
    });
    const score = assessOutputQuality('a'.repeat(1000), result);
    expect(score.whyNowFilled).toBe(2);
    expect(score.whyNowTotal).toBe(3);
    // 2/3 * 20 = 13.33, rounded to 13
    expect(score.breakdown.whyNowQuality).toBe(13);
  });
});

describe('assessAndRecord', () => {
  it('records a metric', async () => {
    const { recordMetric } = await import('../aiMetrics');
    const { assessAndRecord } = await import('../utils/qualityMetrics');
    const result = makeHandoff();
    const score = assessAndRecord('a'.repeat(1000), result);
    expect(score.score).toBeGreaterThan(0);
    expect(recordMetric).toHaveBeenCalled();
  });
});
