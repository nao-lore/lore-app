import type { DecisionWithRationale } from '../types';

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
 * Deduplicate items by case-insensitive text comparison.
 */
export function dedupStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter(s => {
    const key = s.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Deduplicate DecisionWithRationale by decision text.
 */
export function dedupDecisions(items: DecisionWithRationale[]): DecisionWithRationale[] {
  const seen = new Set<string>();
  return items.filter(dr => {
    const key = dr.decision.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
