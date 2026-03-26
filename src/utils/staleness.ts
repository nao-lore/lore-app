/**
 * Staleness threshold for master notes (in milliseconds).
 *
 * 7 days strikes a balance: long enough that notes aren't flagged as stale
 * after a brief pause, short enough to prompt updates for actively-worked
 * projects. This threshold is used to show a visual indicator when a
 * project summary may be outdated and should be regenerated.
 */
export const STALENESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Check if a master note is stale (not updated within the staleness threshold) */
export function isStaleMasterNote(updatedAt: number): boolean {
  return Date.now() - updatedAt > STALENESS_THRESHOLD_MS;
}
