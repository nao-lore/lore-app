import { safeGetItem, safeSetItem } from './storage';
import { safeJsonParse } from './utils/safeJsonParse';

const STORAGE_KEY = 'threadlog_ai_metrics';
const MAX_METRICS = 200;

export interface TransformMetric {
  timestamp: number;
  action: string;
  inputLength: number;
  outputValid: boolean;
  decisionsCount: number;
  todosCount: number;
  durationMs: number;
  cached: boolean;
  qualityWarnings?: string[];
}

function loadMetrics(): TransformMetric[] {
  const raw = safeGetItem(STORAGE_KEY);
  return safeJsonParse<TransformMetric[]>(raw, []);
}

let cache: TransformMetric[] | null = null;

export function recordMetric(m: TransformMetric) {
  const metrics = getMetrics();
  metrics.push(m);
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
  cache = metrics;
  safeSetItem(STORAGE_KEY, JSON.stringify(metrics));
}

export function getMetrics(): TransformMetric[] {
  if (!cache) cache = loadMetrics();
  return [...cache];
}

// Aggregation functions
export function getMetricsSummary() {
  const metrics = getMetrics();
  if (metrics.length === 0) return null;

  const total = metrics.length;
  const validCount = metrics.filter(m => m.outputValid).length;
  const avgDuration = Math.round(metrics.reduce((s, m) => s + m.durationMs, 0) / total);
  const cacheHitRate = Math.round((metrics.filter(m => m.cached).length / total) * 100);
  const avgDecisions = +(metrics.reduce((s, m) => s + m.decisionsCount, 0) / total).toFixed(1);
  const avgTodos = +(metrics.reduce((s, m) => s + m.todosCount, 0) / total).toFixed(1);
  const avgInputLen = Math.round(metrics.reduce((s, m) => s + m.inputLength, 0) / total);

  // Last 7 days
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = metrics.filter(m => m.timestamp > weekAgo);

  return {
    total,
    successRate: Math.round((validCount / total) * 100),
    avgDuration,
    cacheHitRate,
    avgDecisions,
    avgTodos,
    avgInputLen,
    recentCount: recent.length,
  };
}
