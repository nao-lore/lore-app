export interface TransformMetric {
  timestamp: number;
  action: string;
  inputLength: number;
  outputValid: boolean;
  decisionsCount: number;
  todosCount: number;
  durationMs: number;
  cached: boolean;
}

const metrics: TransformMetric[] = [];

export function recordMetric(m: TransformMetric) {
  metrics.push(m);
  if (metrics.length > 100) metrics.shift();
}

export function getMetrics(): TransformMetric[] {
  return [...metrics];
}
