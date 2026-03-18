export const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/** Check if a master note is stale (not updated in 7+ days) */
export function isStaleMasterNote(updatedAt: number): boolean {
  return Date.now() - updatedAt > SEVEN_DAYS;
}
