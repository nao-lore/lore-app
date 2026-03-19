import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { LogEntry, Todo } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';

interface WeekBucket {
  label: string;
  logCount: number;
  todosCompleted: number;
  todosTotal: number;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
}

export default function TrendsSection({ logs, todos, lang }: { logs: LogEntry[]; todos: Todo[]; lang: Lang }) {
  const weeklyData = useMemo(() => {
    const now = new Date();
    const currentWeekStart = getWeekStart(now);

    const buckets: WeekBucket[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const logCount = logs.filter((l) => {
        const d = new Date(l.createdAt);
        return d >= weekStart && d < weekEnd;
      }).length;

      const wsTime = weekStart.getTime();
      const weTime = weekEnd.getTime();
      const weekTodos = todos.filter((td) => {
        const ts = typeof td.createdAt === 'number' ? td.createdAt : new Date(td.createdAt).getTime();
        return ts >= wsTime && ts < weTime;
      });
      const todosCompleted = weekTodos.filter((td) => td.done).length;
      const todosTotal = weekTodos.length;

      buckets.push({ label: formatWeekLabel(weekStart), logCount, todosCompleted, todosTotal });
    }
    return buckets;
  }, [logs, todos]);

  const maxCount = Math.max(1, ...weeklyData.map((w) => w.logCount));

  const thisWeekCount = weeklyData[3]?.logCount ?? 0;
  const lastWeekCount = weeklyData[2]?.logCount ?? 0;
  const avgPerWeek = weeklyData.length > 0
    ? Math.round((weeklyData.reduce((s, w) => s + w.logCount, 0) / weeklyData.length) * 10) / 10
    : 0;

  const changePct = lastWeekCount > 0
    ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
    : thisWeekCount > 0 ? 100 : 0;
  const changeUp = changePct >= 0;

  const totalTodosCompleted = weeklyData.reduce((s, w) => s + w.todosCompleted, 0);
  const totalTodosAll = weeklyData.reduce((s, w) => s + w.todosTotal, 0);
  const completionRate = totalTodosAll > 0 ? Math.round((totalTodosCompleted / totalTodosAll) * 100) : 0;

  if (logs.length === 0) return null;

  return (
    <div className="mb-2xl">
      <div className="section-header" style={{ marginBottom: 14 }}>
        <TrendingUp size={14} style={{ opacity: 0.5 }} />
        {t('trends', lang)}
      </div>

      <div className="flex-col gap-sm mb-lg">
        {weeklyData.map((week, i) => (
          <div key={i} className="flex-row gap-10">
            <span className="text-xs-placeholder shrink-0" style={{ width: 70, textAlign: 'right' }}>
              {week.label}
            </span>
            <div style={{ flex: 1, height: 18, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(week.logCount / maxCount) * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                  minWidth: week.logCount > 0 ? 4 : 0,
                }}
              />
            </div>
            <span className="text-xs-muted shrink-0" style={{ width: 50 }}>
              {tf('logsCount', lang, week.logCount)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-12">
        <div className="stat-card p-card stat-card-flex">
          <div className="stat-label mb-4" style={{ marginTop: 0 }}>
            {t('vsLastWeek', lang)}
          </div>
          <div className="stat-value" style={{ fontSize: 18, color: changeUp ? 'var(--success-text, #22c55e)' : 'var(--error-text, #ef4444)' }}>
            {changeUp ? '\u2191' : '\u2193'} {Math.abs(changePct)}%
          </div>
        </div>

        <div className="stat-card p-card stat-card-flex">
          <div className="stat-label mb-4" style={{ marginTop: 0 }}>
            {t('avgPerWeek', lang)}
          </div>
          <div className="stat-value fs-18">
            {avgPerWeek}
          </div>
        </div>

        <div className="stat-card p-card stat-card-flex">
          <div className="stat-label mb-4" style={{ marginTop: 0 }}>
            {t('completionRate', lang)}
          </div>
          <div className="stat-value fs-18">
            {completionRate}%
          </div>
        </div>
      </div>
    </div>
  );
}
