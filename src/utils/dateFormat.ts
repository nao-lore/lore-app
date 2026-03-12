const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today 14:30" or "Mar 5" */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  if (isSameDay(d, now)) return `Today ${hours}:${mins}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Today 14:30" or "Mar 5, 2026" */
export function formatDateFull(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  if (isSameDay(d, now)) return `Today ${hours}:${mins}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Mar 5, 2026" (no time, no "Today") */
export function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Today" or "Mar 5, 2026" — for group headers */
export function formatDateGroup(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return 'Today';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
