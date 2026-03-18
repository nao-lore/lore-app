import type { DecisionWithRationale } from '../types';
import { fuzzyDedupStrings, fuzzyDedupByField } from './fuzzyDedup';

/**
 * Normalize decisions to dual format.
 * Returns both decisionRationales (structured) and decisions (legacy string[]).
 */
export function normalizeDecisions(
  decisionRationales?: DecisionWithRationale[],
  decisions?: string[]
): { decisionRationales: DecisionWithRationale[]; decisions: string[] } {
  if (decisionRationales && decisionRationales.length > 0) {
    return {
      decisionRationales,
      decisions: decisionRationales.map(dr => dr.decision),
    };
  }
  if (decisions && decisions.length > 0) {
    return {
      decisionRationales: decisions.map(d => ({ decision: d, rationale: null })),
      decisions,
    };
  }
  return { decisionRationales: [], decisions: [] };
}

/**
 * Deduplicate items by fuzzy similarity (Jaccard on keywords).
 * Falls back to exact dedup for very short lists.
 */
export function dedupStrings(items: string[]): string[] {
  return fuzzyDedupStrings(items);
}

/**
 * Deduplicate DecisionWithRationale by fuzzy similarity on decision text.
 */
export function dedupDecisions(items: DecisionWithRationale[]): DecisionWithRationale[] {
  return fuzzyDedupByField(items, dr => dr.decision);
}
