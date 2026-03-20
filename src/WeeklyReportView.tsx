import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Copy, Printer, Trash2, FileBarChart } from 'lucide-react';
import type { LogEntry, Project, Todo, WeeklyReport } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { loadWeeklyReports, saveWeeklyReport, getWeeklyReport, deleteWeeklyReport, setLastReportDate, safeGetItem } from './storage';
import { generateWeeklyReport, weeklyReportToMarkdown } from './weeklyReport';
import ConfirmDialog from './ConfirmDialog';
import { WORKLOAD_CONFIG } from './workload';
import { formatDateFull } from './utils/dateFormat';
import type { WorkloadLevel } from './workload';

// ─── Date helpers ───

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(start: Date, lang: Lang): string {
  const end = addDays(start, 6);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (lang === 'ja') {
    return `${start.getMonth() + 1}/${start.getDate()} — ${end.getMonth() + 1}/${end.getDate()}`;
  }
  return `${months[start.getMonth()]} ${start.getDate()} — ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

// ─── Component ───

interface WeeklyReportViewProps {
  logs: LogEntry[];
  projects: Project[];
  todos: Todo[];
  onBack: () => void;
  onNewLog?: () => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export default function WeeklyReportView({ logs, projects, todos, onBack, onNewLog, lang, showToast }: WeeklyReportViewProps) {
  // Week navigation: default to this week
  const [weekOffset, setWeekOffset] = useState(0);
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [progressPhase, setProgressPhase] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<WeeklyReport | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reportsVersion, setReportsVersion] = useState(0);
  const [sendingSlack, setSendingSlack] = useState(false);

  const weekStart = useMemo(() => {
    const now = new Date();
    const monday = getMonday(now);
    return addDays(monday, weekOffset * 7);
  }, [weekOffset]);
  const weekEnd = addDays(weekStart, 6);
  const weekStartStr = fmt(weekStart);
  const weekEndStr = fmt(weekEnd);

  // Filter logs for this week
  const weekLogs = useMemo(() => {
    return logs.filter((l) => {
      const d = l.createdAt.slice(0, 10);
      if (d < weekStartStr || d > weekEndStr) return false;
      if (projectFilter && l.projectId !== projectFilter) return false;
      return true;
    });
  }, [logs, weekStartStr, weekEndStr, projectFilter]);

  const weekTodos = useMemo(() => {
    return todos.filter((td) => {
      const d = new Date(td.createdAt).toISOString().slice(0, 10);
      return d >= weekStartStr && d <= weekEndStr;
    });
  }, [todos, weekStartStr, weekEndStr]);

  // Existing report for this week
  const existingReport = useMemo(() => {
    void reportsVersion;
    return getWeeklyReport(weekStartStr, projectFilter || undefined);
  }, [weekStartStr, projectFilter, reportsVersion]);

  // All saved reports
  const savedReports = useMemo(() => {
    void reportsVersion;
    return loadWeeklyReports();
  }, [reportsVersion]);

  const projectName = projectFilter ? projects.find((p) => p.id === projectFilter)?.name : undefined;

  const handleGenerate = async () => {
    if (existingReport && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    setLoading(true);
    setError(null);
    setProgressPhase(t('weeklyReportPreparing', lang));

    try {
      const report = await generateWeeklyReport({
        logs: weekLogs,
        todos: weekTodos,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        projectId: projectFilter || undefined,
        projectName,
        onProgress: (phase) => {
          if (phase === 'preparing') setProgressPhase(t('weeklyReportPreparing', lang));
          else if (phase === 'generating') setProgressPhase(t('weeklyReportGenerating', lang));
        },
      });

      saveWeeklyReport(report);
      setLastReportDate(Date.now());
      setReportsVersion((v) => v + 1);
      setViewingReport(report);
      showToast?.(t('weeklyReportSaved', lang), 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showToast?.(msg, 'error');
    } finally {
      setLoading(false);
      setProgressPhase('');
    }
  };

  const handleCopy = async (report: WeeklyReport) => {
    const pName = report.projectId ? projects.find((p) => p.id === report.projectId)?.name : undefined;
    try {
      await navigator.clipboard.writeText(weeklyReportToMarkdown(report, pName));
      showToast?.(t('weeklyReportCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSlackPost = async (report: WeeklyReport) => {
    if (!safeGetItem('threadlog_slack_webhook_url')) {
      showToast?.(t('slackNotConfigured', lang), 'error');
      return;
    }
    setSendingSlack(true);
    try {
      const pName = report.projectId ? projects.find((p) => p.id === report.projectId)?.name : undefined;
      const { sendToSlack } = await import('./integrations');
      await sendToSlack(weeklyReportToMarkdown(report, pName));
      showToast?.(t('slackSent', lang), 'success');
    } catch (err) {
      if (import.meta.env.DEV) console.error('[WeeklyReportView] Slack export error:', err);
      showToast?.(t('errorExportFailed', lang), 'error');
    } finally {
      setSendingSlack(false);
    }
  };

  const handleDelete = (id: string) => {
    deleteWeeklyReport(id);
    setReportsVersion((v) => v + 1);
    if (viewingReport?.id === id) setViewingReport(null);
    setConfirmDeleteId(null);
  };

  // Render report detail
  const renderReport = (report: WeeklyReport) => {
    const pName = report.projectId ? projects.find((p) => p.id === report.projectId)?.name : undefined;
    return (
      <div className="weekly-report-content" id="weekly-report-print">
        {/* Header */}
        <div className="flex justify-between items-start mb-lg">
          <div>
            <h3 className="report-h3">
              {formatWeekLabel(new Date(report.weekStart), lang)}
            </h3>
            {pName && <span className="tag text-sm">{pName}</span>}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm-action" onClick={() => handleCopy(report)}>
              <Copy size={12} /> {t('mnCopy', lang)}
            </button>
            <button className="btn btn-sm-action" onClick={handlePrint}>
              <Printer size={12} /> {t('weeklyReportPrint', lang)}
            </button>
            {!!safeGetItem('threadlog_slack_webhook_url') && (
              <button
                className="btn btn-sm-action"
                onClick={() => handleSlackPost(report)}
                disabled={sendingSlack}
              >
                {sendingSlack ? t('slackSending', lang) : t('slackPost', lang)}
              </button>
            )}
            <button className="btn btn-sm-action" style={{ color: 'var(--error-text)' }} onClick={() => setConfirmDeleteId(report.id)}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Summary */}
        <ReportSection title={t('weeklyReportSummary', lang)}>
          <p className="lh-relaxed" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
        </ReportSection>

        {/* Achievements */}
        {report.achievements.length > 0 && (
          <ReportSection title={t('weeklyReportAchievements', lang)}>
            <ul className="report-list">{report.achievements.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </ReportSection>
        )}

        {/* Decisions */}
        {report.decisions.length > 0 && (
          <ReportSection title={t('weeklyReportDecisions', lang)}>
            <ul className="report-list">{report.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </ReportSection>
        )}

        {/* Open Items */}
        {report.openItems.length > 0 && (
          <ReportSection title={t('weeklyReportOpenItems', lang)}>
            <ul className="report-list">{report.openItems.map((o, i) => <li key={i}>{o}</li>)}</ul>
          </ReportSection>
        )}

        {/* Completed TODOs */}
        {report.completedTodos.length > 0 && (
          <ReportSection title={t('weeklyReportCompletedTodos', lang)}>
            <ul className="report-list report-list-check">{report.completedTodos.map((item, i) => <li key={i}>{item}</li>)}</ul>
          </ReportSection>
        )}

        {/* Pending TODOs */}
        {report.pendingTodos.length > 0 && (
          <ReportSection title={t('weeklyReportPendingTodos', lang)}>
            <ul className="report-list report-list-pending">{report.pendingTodos.map((item, i) => <li key={i}>{item}</li>)}</ul>
          </ReportSection>
        )}

        {/* Next Week */}
        {report.nextWeek.length > 0 && (
          <ReportSection title={t('weeklyReportNextWeek', lang)}>
            <ul className="report-list">{report.nextWeek.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </ReportSection>
        )}

        {/* Stats */}
        <ReportSection title={t('weeklyReportStats', lang)}>
          <div className="report-stats-grid">
            <div className="report-stat">
              <span className="report-stat-value">{report.stats.logCount}</span>
              <span className="report-stat-label">{t('statsTotalLogs', lang)}</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.stats.worklogCount}</span>
              <span className="report-stat-label">Worklog</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.stats.handoffCount}</span>
              <span className="report-stat-label">Handoff</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.stats.todoCompletionRate}%</span>
              <span className="report-stat-label">{t('weeklyReportTodoCompletionRate', lang)}</span>
            </div>
            {report.stats.averageWorkload && (
              <div className="report-stat" style={{ background: WORKLOAD_CONFIG[report.stats.averageWorkload as WorkloadLevel].bg }}>
                <span className="report-stat-value">{WORKLOAD_CONFIG[report.stats.averageWorkload as WorkloadLevel].emoji}</span>
                <span className="report-stat-label" style={{ color: WORKLOAD_CONFIG[report.stats.averageWorkload as WorkloadLevel].color }}>
                  {t('weeklyReportAvgWorkload', lang)}
                </span>
              </div>
            )}
          </div>
        </ReportSection>

        <div className="meta text-right report-footer">
          {t('weeklyReportGeneratedAt', lang)}: {formatDateFull(new Date(report.generatedAt).toISOString())}
        </div>
      </div>
    );
  };

  return (
    <div className="workspace-content-wide">
      <div className="page-header">
        <button className="btn-back btn-back-mb" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2 className="flex-row-gap-sm">
              <FileBarChart size={20} />
              {t('weeklyReportTitle', lang)}
            </h2>
            <p className="page-subtitle">{t('weeklyReportDesc', lang)}</p>
          </div>
        </div>
      </div>

      {/* Week selector + project filter */}
      <div className="content-card toolbar-card-mb gap-12">
        <div className="flex-row-gap-sm">
          <button className="btn btn-sm nav-btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="week-label">
            {formatWeekLabel(weekStart, lang)}
          </span>
          <button className="btn btn-sm nav-btn-sm" onClick={() => setWeekOffset((w) => w + 1)} disabled={weekOffset >= 0}>
            <ChevronRight size={16} />
          </button>
          <button className="btn btn-sm btn-sm-action" onClick={() => setWeekOffset(0)} style={{ minHeight: 28 }}>
            {t('timelineToday', lang)}
          </button>
        </div>

        {/* Project filter */}
        {projects.length > 0 && (
          <select
            className="input input-sm text-sm"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label={t('weeklyReportAllProjects', lang)}
            style={{ padding: '4px 8px', minHeight: 28, maxWidth: 200 }}
          >
            <option value="">{t('weeklyReportAllProjects', lang)}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
            ))}
          </select>
        )}

        <div className="flex-row-gap-sm ml-auto">
          <span className="meta text-sm">
            {tf('weeklyReportLogCountInline', lang, weekLogs.length)}
          </span>
          <button
            className="btn btn-primary text-sm"
            onClick={handleGenerate}
            disabled={weekLogs.length === 0 || loading}
          >
            {loading ? progressPhase : (existingReport ? t('weeklyReportRegenerate', lang) : t('weeklyReportGenerate', lang))}
          </button>
        </div>
      </div>

      {/* No logs message */}
      {weekLogs.length === 0 && !viewingReport && !showSaved && (
        <div className="empty-state mt-2xl">
          <div className="empty-state-icon">&#128202;</div>
          <p>{t('weeklyReportNoLogs', lang)}</p>
          <p className="page-subtitle">{t('weeklyReportNoLogsHint', lang)}</p>
          {onNewLog && (
            <button className="btn btn-primary mt-md" onClick={onNewLog}>
              {t('weeklyReportCreateLog', lang)}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="content-card text-sm text-error mb-lg">
          {error}
        </div>
      )}

      {/* Viewing a report */}
      {viewingReport && renderReport(viewingReport)}

      {/* Show existing report for current week if not already viewing */}
      {!viewingReport && existingReport && (
        <div className="mb-lg">
          <button
            className="btn text-sm"
            onClick={() => setViewingReport(existingReport)}
          >
            {t('weeklyReportViewSaved', lang)}
          </button>
        </div>
      )}

      {/* Saved reports list */}
      <div style={{ marginTop: viewingReport ? 24 : 0 }}>
        <button
          className="btn fs-13 mb-md"
          onClick={() => setShowSaved(!showSaved)}
        >
          {t('weeklyReportSavedReports', lang)} ({savedReports.length})
        </button>

        {showSaved && (
          <div className="flex-col-gap-8">
            {savedReports.length === 0 ? (
              <div className="empty-state">
                <p>{t('weeklyReportNoSaved', lang)}</p>
                <p className="page-subtitle">{t('weeklyReportNoSavedDesc', lang)}</p>
              </div>
            ) : (
              savedReports.map((r) => {
                const pName = r.projectId ? projects.find((p) => p.id === r.projectId)?.name : undefined;
                return (
                  <div
                    key={r.id}
                    className="content-card content-card-clickable saved-report-item"
                    onClick={() => { setViewingReport(r); setShowSaved(false); }}
                  >
                    <FileBarChart size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div className="flex-1">
                      <div className="saved-report-title">
                        {formatWeekLabel(new Date(r.weekStart), lang)}
                      </div>
                      <div className="meta report-saved-meta">
                        {pName && <span>{pName}</span>}
                        <span>{r.stats.logCount} logs</span>
                      </div>
                    </div>
                    <div className="flex gap-4" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-sm-compact pad-2-6" onClick={() => handleCopy(r)}>
                        <Copy size={12} />
                      </button>
                      <button className="btn btn-sm btn-sm-compact pad-2-6" style={{ color: 'var(--error-text)' }} onClick={() => setConfirmDeleteId(r.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Overwrite confirmation */}
      {confirmOverwrite && (
        <ConfirmDialog
          title={t('weeklyReportOverwrite', lang)}
          description=""
          confirmLabel={t('weeklyReportOverwriteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={handleGenerate}
          onCancel={() => setConfirmOverwrite(false)}
          danger={false}
        />
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <ConfirmDialog
          title={t('weeklyReportDeleteConfirm', lang)}
          description=""
          confirmLabel={t('weeklyReportDelete', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="content-card mb-md">
      <div className="content-card-header">{title}</div>
      {children}
    </div>
  );
}
