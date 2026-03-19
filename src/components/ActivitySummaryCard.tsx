import { useMemo } from 'react';
import type { LogEntry, Project, Todo } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { getStreak, getTotalSnapshots, getWeeklyGoal } from '../storage';
import { checkAchievements } from '../utils/achievements';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ActivitySummaryCard({ logs, todos, projects, lang }: { logs: LogEntry[]; todos: Todo[]; projects: Project[]; lang: Lang }) {
  const streak = useMemo(() => getStreak(), []);
  const totalSnapshots = useMemo(() => getTotalSnapshots(), []);
  const weeklyGoal = useMemo(() => getWeeklyGoal(), []);
  const badges = useMemo(() => checkAchievements(), []);

  const stats = useMemo(() => {
    const totalLogs = logs.length;
    const todosDone = todos.filter((td) => td.done).length;
    const todosPending = todos.filter((td) => !td.done).length;
    const activeProjects = projects.filter((p) => logs.some((l) => l.projectId === p.id)).length;

    const now = new Date();
    const weekStart = getWeekStart(now);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekLogs = logs.filter((l) => new Date(l.createdAt) >= weekStart).length;
    const lastWeekLogs = logs.filter((l) => {
      const d = new Date(l.createdAt);
      return d >= lastWeekStart && d < weekStart;
    }).length;
    const weekDiff = thisWeekLogs - lastWeekLogs;

    const projectCounts: Record<string, number> = {};
    for (const l of logs) {
      if (l.projectId) projectCounts[l.projectId] = (projectCounts[l.projectId] || 0) + 1;
    }
    let topProjectName: string | null = null;
    let topCount = 0;
    for (const [pid, count] of Object.entries(projectCounts)) {
      if (count > topCount) {
        topCount = count;
        const proj = projects.find((p) => p.id === pid);
        topProjectName = proj ? `${proj.icon || '\ud83d\udcc2'} ${proj.name}` : null;
      }
    }

    return { totalLogs, todosDone, todosPending, activeProjects, thisWeekLogs, lastWeekLogs, weekDiff, topProjectName, topCount };
  }, [logs, todos, projects]);

  if (stats.totalLogs === 0) return null;

  const diffLabel = stats.weekDiff >= 0 ? `+${stats.weekDiff}` : `${stats.weekDiff}`;
  const diffColor = stats.weekDiff >= 0 ? 'var(--success-text, #22c55e)' : 'var(--error-text, #ef4444)';
  const isJa = lang === 'ja';

  return (
    <div className="mb-2xl">
      <div
        style={{
          padding: '18px 22px', borderRadius: 12,
          background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
        }}
      >
        {/* #35 Prominent streak card when streak >= 3 */}
        {streak >= 3 && (
          <div style={{
            marginBottom: 16, padding: '14px 18px', borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(239,68,68,0.08) 100%)',
            border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 32 }}>{'\ud83d\udd25'}</span>
            <div>
              <div className="font-extrabold" style={{ fontSize: 24, color: 'var(--warning-text, #f59e0b)', lineHeight: 1.2 }}>
                {streak} {isJa ? '\u65e5\u9023\u7d9a' : `day${streak > 1 ? 's' : ''} streak`}
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                {t('streakKeepGoing', lang)}
              </div>
            </div>
          </div>
        )}

        <div className="flex-row justify-between mb-md">
          <div className="section-title font-semibold font-bold">
            {isJa ? '\u3042\u306a\u305f\u306e\u30a2\u30af\u30c6\u30a3\u30d3\u30c6\u30a3' : 'Your Activity'}
          </div>
          {streak > 0 && streak < 3 && (
            <div className="flex-row" style={{ gap: 4, fontSize: 13, color: 'var(--warning-text, #f59e0b)' }}>
              <span style={{ fontSize: 16 }}>{'\ud83d\udd25'}</span>
              <span className="font-extrabold" style={{ fontSize: 20 }}>{streak}</span>
              <span className="font-semibold">{isJa ? '\u65e5\u9023\u7d9a' : `day${streak > 1 ? 's' : ''} streak`}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-baseline" style={{ gap: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <span className="font-extrabold text-secondary" style={{ fontSize: 22 }}>{stats.totalLogs}</span>
          <span>{isJa ? '\u30ed\u30b0' : 'logs'}</span>
          <span style={{ color: 'var(--text-placeholder)', margin: '0 2px' }}>&middot;</span>
          <span className="font-extrabold text-secondary" style={{ fontSize: 22 }}>{stats.todosDone}</span>
          <span>{isJa ? 'TODO\u5b8c\u4e86' : 'TODOs done'}</span>
          <span style={{ color: 'var(--text-placeholder)', margin: '0 2px' }}>&middot;</span>
          <span className="font-extrabold text-secondary" style={{ fontSize: 22 }}>{stats.activeProjects}</span>
          <span>{isJa ? '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8' : 'projects'}</span>
        </div>

        <div className="mt-sm text-sm text-muted">
          {isJa ? '\u4eca\u9031' : 'This week'}: <span className="font-bold text-secondary">{stats.thisWeekLogs}</span> {isJa ? '\u30ed\u30b0' : 'logs'}
          {' '}
          <span style={{ color: diffColor, fontWeight: 600 }}>
            ({diffLabel} {isJa ? '\u5148\u9031\u6bd4' : 'from last week'})
          </span>
        </div>

        {stats.topProjectName && (
          <div className="text-xs-placeholder" style={{ marginTop: 6 }}>
            {isJa ? '\u6700\u3082\u6d3b\u767a:' : 'Most active:'} <span className="text-muted font-semibold">{stats.topProjectName}</span>
            <span style={{ opacity: 0.6 }}> ({stats.topCount} {isJa ? '\u30ed\u30b0' : 'logs'})</span>
          </div>
        )}

        {totalSnapshots > 0 && (
          <div className="text-xs-placeholder" style={{ marginTop: 6 }}>
            {t('dashboardTotalSnapshots', lang)}: <span className="text-muted font-semibold">{totalSnapshots}</span>
          </div>
        )}

        {weeklyGoal > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="flex-row justify-between" style={{ fontSize: 12, marginBottom: 4 }}>
              <span className="text-muted font-semibold">
                {stats.thisWeekLogs >= weeklyGoal
                  ? t('weeklyGoalReached', lang)
                  : tf('weeklyGoalProgress', lang, stats.thisWeekLogs, weeklyGoal)}
              </span>
            </div>
            <div className="progress-bar-track">
              <div style={{
                height: '100%',
                width: `${Math.min((stats.thisWeekLogs / weeklyGoal) * 100, 100)}%`,
                borderRadius: 3,
                background: stats.thisWeekLogs >= weeklyGoal ? 'var(--success-text, #22c55e)' : 'var(--accent)',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {badges.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
            {badges.map((badge) => (
              <span
                key={badge.id}
                className="badge badge-accent font-semibold"
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12 }}
              >
                {badge.emoji} {t(badge.labelKey as Parameters<typeof t>[0], lang)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
