/**
 * Workload analysis — AI-based log stress/load estimation.
 */
import type { LogEntry } from './types';
import { getApiKey } from './storage';
import { shouldUseBuiltinApi } from './provider';
import { callProvider } from './provider';
import type { ProviderRequest } from './provider';
import { extractJson } from './transform';
import { t } from './i18n';
import type { Lang } from './i18n';

const SYSTEM_PROMPT = `You are a workload analyzer. Given a work log, estimate the workload/stress level.

Rules:
- Analyze the content for: number of tasks, complexity, blockers, time pressure, context switching.
- "high" = many tasks, blockers, urgent items, complex problems, or signs of overwork.
- "medium" = normal workload, some tasks completed, manageable complexity.
- "low" = few tasks, routine work, no blockers, light activity.
- Output ONLY a valid JSON object: {"level": "high" | "medium" | "low"}`;

function formatLogForAnalysis(log: LogEntry): string {
  const lines: string[] = [];
  lines.push(`Title: ${log.title}`);

  if (log.outputMode === 'handoff') {
    if (log.currentStatus?.length) lines.push('Current Status: ' + log.currentStatus.join('; '));
    if (log.nextActions?.length) lines.push('Next Actions: ' + log.nextActions.join('; '));
    if (log.completed?.length) lines.push('Completed: ' + log.completed.join('; '));
    if (log.blockers?.length) lines.push('Blockers: ' + log.blockers.join('; '));
    if (log.constraints?.length) lines.push('Constraints: ' + log.constraints.join('; '));
  } else {
    if (log.today.length) lines.push('Today: ' + log.today.join('; '));
    if (log.decisions.length) lines.push('Decisions: ' + log.decisions.join('; '));
    if (log.todo.length) lines.push('TODO: ' + log.todo.join('; '));
  }
  if (log.tags.length) lines.push('Tags: ' + log.tags.join(', '));
  return lines.join('\n');
}

export async function analyzeWorkload(log: LogEntry): Promise<'high' | 'medium' | 'low'> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) throw new Error('[API Key] Not set. Go to Settings and enter your API key.');

  const req: ProviderRequest = {
    apiKey,
    system: SYSTEM_PROMPT,
    userMessage: formatLogForAnalysis(log),
    maxTokens: 64,
  };

  const response = await callProvider(req);

  try {
    const jsonText = extractJson(response);
    const parsed = JSON.parse(jsonText);
    const level = parsed.level;
    if (level === 'high' || level === 'medium' || level === 'low') return level;
  } catch { /* ignore */ }
  return 'medium';
}

export type WorkloadLevel = 'high' | 'medium' | 'low';

export const WORKLOAD_CONFIG: Record<WorkloadLevel, { label: (lang: Lang) => string; emoji: string; color: string; bg: string }> = {
  high: {
    label: (lang) => t('workloadHigh', lang),
    emoji: '🔴',
    color: 'var(--error-text)',
    bg: 'var(--tint-priority-high, rgba(239,68,68,0.08))',
  },
  medium: {
    label: (lang) => t('workloadMedium', lang),
    emoji: '🟡',
    color: 'var(--warning-text, #b45309)',
    bg: 'var(--tint-priority-medium, rgba(245,158,11,0.08))',
  },
  low: {
    label: (lang) => t('workloadLow', lang),
    emoji: '🟢',
    color: 'var(--success-text)',
    bg: 'var(--success-bg)',
  },
};
