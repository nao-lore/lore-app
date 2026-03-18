/**
 * aiMetrics.test.ts — Unit tests for AI metrics tracking
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

import { recordMetric, getMetrics, getMetricsSummary } from '../aiMetrics';
import type { TransformMetric } from '../aiMetrics';

function makeMetric(overrides?: Partial<TransformMetric>): TransformMetric {
  return {
    timestamp: Date.now(),
    action: 'transform',
    inputLength: 1000,
    outputValid: true,
    decisionsCount: 2,
    todosCount: 3,
    durationMs: 500,
    cached: false,
    ...overrides,
  };
}

describe('recordMetric', () => {
  beforeEach(() => {
    store.clear();
    // Reset the internal cache by re-importing would be complex;
    // we rely on each test starting fresh via store.clear()
    // The cache variable is module-level, so we need to force reload
    vi.resetModules();
  });

  it('adds a metric to storage', async () => {
    const { recordMetric: rec, getMetrics: get } = await import('../aiMetrics');
    const m = makeMetric();
    rec(m);
    const metrics = get();
    expect(metrics.length).toBeGreaterThanOrEqual(1);
    expect(metrics[metrics.length - 1].action).toBe('transform');
  });

  it('persists metrics in localStorage', async () => {
    const { recordMetric: rec } = await import('../aiMetrics');
    rec(makeMetric({ action: 'handoff' }));
    const raw = store.get('threadlog_ai_metrics');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[parsed.length - 1].action).toBe('handoff');
  });

  it('caps at 200 metrics', async () => {
    const { recordMetric: rec, getMetrics: get } = await import('../aiMetrics');
    for (let i = 0; i < 210; i++) {
      rec(makeMetric({ action: `action-${i}` }));
    }
    const metrics = get();
    expect(metrics.length).toBe(200);
    // Oldest should have been evicted
    expect(metrics[0].action).toBe('action-10');
  });
});

describe('getMetrics', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('returns empty array when no metrics stored', async () => {
    const { getMetrics: get } = await import('../aiMetrics');
    expect(get()).toEqual([]);
  });

  it('returns a copy (not the internal cache)', async () => {
    const { recordMetric: rec, getMetrics: get } = await import('../aiMetrics');
    rec(makeMetric());
    const a = get();
    const b = get();
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // Different array references
  });

  it('loads from localStorage on first call', async () => {
    const existing = [makeMetric({ action: 'preloaded' })];
    store.set('threadlog_ai_metrics', JSON.stringify(existing));
    const { getMetrics: get } = await import('../aiMetrics');
    const metrics = get();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].action).toBe('preloaded');
  });
});

describe('getMetricsSummary', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('returns null for empty metrics', async () => {
    const { getMetricsSummary: getSummary } = await import('../aiMetrics');
    expect(getSummary()).toBeNull();
  });

  it('computes correct aggregation', async () => {
    const { recordMetric: rec, getMetricsSummary: getSummary } = await import('../aiMetrics');
    rec(makeMetric({ durationMs: 100, outputValid: true, cached: false, decisionsCount: 2, todosCount: 4, inputLength: 500 }));
    rec(makeMetric({ durationMs: 300, outputValid: true, cached: true, decisionsCount: 4, todosCount: 6, inputLength: 1500 }));

    const summary = getSummary();
    expect(summary).not.toBeNull();
    expect(summary!.total).toBe(2);
    expect(summary!.successRate).toBe(100);
    expect(summary!.avgDuration).toBe(200);
    expect(summary!.cacheHitRate).toBe(50);
    expect(summary!.avgDecisions).toBe(3);
    expect(summary!.avgTodos).toBe(5);
    expect(summary!.avgInputLen).toBe(1000);
  });

  it('calculates successRate with failures', async () => {
    const { recordMetric: rec, getMetricsSummary: getSummary } = await import('../aiMetrics');
    rec(makeMetric({ outputValid: true }));
    rec(makeMetric({ outputValid: false }));

    const summary = getSummary();
    expect(summary!.successRate).toBe(50);
  });

  it('tracks recent count within last 7 days', async () => {
    const { recordMetric: rec, getMetricsSummary: getSummary } = await import('../aiMetrics');
    rec(makeMetric({ timestamp: Date.now() })); // Recent
    rec(makeMetric({ timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 })); // 8 days ago

    const summary = getSummary();
    expect(summary!.recentCount).toBe(1);
  });
});
