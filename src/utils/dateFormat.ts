/** Returns today's date as "YYYY-MM-DD" */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** "2026/03/05 14:30" — full timestamp */
export function formatDateTimeFull(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

/** Relative time: "just now", "2m ago", "3h ago", "Yesterday", or fallback to formatDateFull */
export function formatRelativeTime(iso: string, locale: 'en' | 'ja' = 'en'): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return formatDateFull(iso);

  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return locale === 'ja' ? 'たった今' : 'just now';
  if (diffMin < 60) return locale === 'ja' ? `${diffMin}分前` : `${diffMin}m ago`;
  if (diffHour < 24) return locale === 'ja' ? `${diffHour}時間前` : `${diffHour}h ago`;
  if (diffHour < 48) return locale === 'ja' ? '昨日' : 'Yesterday';
  return formatDateFull(iso);
}
