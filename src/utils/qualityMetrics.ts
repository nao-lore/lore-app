/**
 * qualityMetrics.ts — Assess output quality of AI transform results.
 *
 * Provides a 0-100 score based on field completeness and content quality.
 * Called after transform to track quality trends via recordMetric.
 */

import type { HandoffResult } from '../types';
import { recordMetric } from '../aiMetrics';

export interface QualityScore {
  score: number;            // 0-100 overall quality score
  hasDecisions: boolean;
  hasNextActions: boolean;
  hasResumeChecklist: boolean;
  whyNowFilled: number;    // count of resumeChecklist items with whyNow filled
  whyNowTotal: number;     // total resumeChecklist items
  breakdown: {
    decisions: number;        // 0-20
    nextActions: number;      // 0-20
    resumeChecklist: number;  // 0-20
    whyNowQuality: number;   // 0-20
    completeness: number;     // 0-20
  };
}

/**
 * Assess the quality of a handoff transform result.
 *
 * Scoring breakdown (each 0-20, total 0-100):
 * - decisions: 0 if empty (suspicious for non-trivial input), 20 if populated
 * - nextActions: 0 if empty, 20 if populated
 * - resumeChecklist: 0 if empty, 20 if populated
 * - whyNow quality: proportion of resumeChecklist items with whyNow filled
 * - completeness: based on currentStatus + completed being non-empty
 */
export function assessOutputQuality(input: string, output: HandoffResult): QualityScore {
  const inputLength = input.length;
  const isTrivial = inputLength < 500;

  // Decisions
  const hasDecisions = (output.decisions?.length ?? 0) > 0;
  const decisionsScore = hasDecisions ? 20 : (isTrivial ? 15 : 0);

  // Next actions
  const hasNextActions = (output.nextActions?.length ?? 0) > 0;
  const nextActionsScore = hasNextActions ? 20 : (isTrivial ? 15 : 0);

  // Resume checklist
  const hasResumeChecklist = (output.resumeChecklist?.length ?? 0) > 0;
  const resumeChecklistScore = hasResumeChecklist ? 20 : (isTrivial ? 15 : 0);

  // whyNow quality
  const whyNowTotal = output.resumeChecklist?.length ?? 0;
  const whyNowFilled = output.resumeChecklist?.filter(
    r => r.whyNow && r.whyNow.trim().length > 0
  ).length ?? 0;
  const whyNowQuality = whyNowTotal > 0
    ? Math.round((whyNowFilled / whyNowTotal) * 20)
    : (isTrivial ? 15 : 0);

  // Completeness — currentStatus and completed
  const hasCurrentStatus = (output.currentStatus?.length ?? 0) > 0;
  const hasCompleted = (output.completed?.length ?? 0) > 0;
  let completenessScore = 0;
  if (hasCurrentStatus) completenessScore += 10;
  if (hasCompleted) completenessScore += 10;
  if (!hasCurrentStatus && !hasCompleted && isTrivial) completenessScore = 15;

  const score = decisionsScore + nextActionsScore + resumeChecklistScore + whyNowQuality + completenessScore;

  return {
    score,
    hasDecisions,
    hasNextActions,
    hasResumeChecklist,
    whyNowFilled,
    whyNowTotal,
    breakdown: {
      decisions: decisionsScore,
      nextActions: nextActionsScore,
      resumeChecklist: resumeChecklistScore,
      whyNowQuality,
      completeness: completenessScore,
    },
  };
}

/**
 * Assess quality and record as a metric.
 */
export function assessAndRecord(input: string, output: HandoffResult): QualityScore {
  const quality = assessOutputQuality(input, output);
  recordMetric({
    timestamp: Date.now(),
    action: 'quality_assessment',
    inputLength: input.length,
    outputValid: quality.score >= 40,
    decisionsCount: output.decisions?.length ?? 0,
    todosCount: 0,
    durationMs: 0,
    cached: false,
  });
  return quality;
}
