import type { Todo } from '../types';
import { todayISO } from '../utils/dateFormat';

export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

export function isDueToday(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = todayISO();
  return dueDate === today;
}

export const STALE_DAYS = 3;

export function isStaleTodo(todo: Todo): boolean {
  if (todo.done) return false;
  const created = new Date(todo.createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= STALE_DAYS;
}

export const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function priorityStyles(p?: string): { bg: string; hoverBg: string; border: string } {
  switch (p) {
    case 'high':
      return { bg: 'var(--tint-priority-high)', hoverBg: 'var(--tint-priority-high)', border: 'var(--line-priority-high)' };
    case 'medium':
      return { bg: 'var(--tint-priority-medium)', hoverBg: 'var(--tint-priority-medium)', border: 'var(--line-priority-medium)' };
    case 'low':
      return { bg: 'transparent', hoverBg: 'var(--sidebar-hover)', border: 'var(--line-priority-low)' };
    default:
      return { bg: 'transparent', hoverBg: 'var(--sidebar-hover)', border: 'transparent' };
  }
}
