import { useState, useMemo } from 'react';
import { BookOpen, RefreshCw, Lightbulb, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import type { LogEntry, Project, KnowledgeBase } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getKnowledgeBase, saveKnowledgeBase } from './storage';
import { generateKnowledgeBase, type KBProgress } from './knowledgeBase';
import ProgressPanel, { type ProgressState } from './ProgressPanel';
import { formatDateTimeFull, formatDateFull } from './utils/dateFormat';

interface KnowledgeBaseViewProps {
  project: Project;
  logs: LogEntry[];
  onBack: () => void;
  onOpenLog: (id: string) => void;
  lang: Lang;
  showToast: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

function formatDate(ts: number, lang: Lang): string {
  const iso = new Date(ts).toISOString();
  if (lang === 'ja') return formatDateTimeFull(iso);
  // English: "Mar 5, 2026 14:30"
  const base = formatDateFull(iso);
  // formatDateFull already includes time for "Today" — for other dates, append time
  if (base.startsWith('Today')) return base;
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${base} ${h}:${m}`;
}

export default function KnowledgeBaseView({ project, logs, onBack, onOpenLog, lang, showToast }: KnowledgeBaseViewProps) {
  const [kb, setKb] = useState<KnowledgeBase | undefined>(() => getKnowledgeBase(project.id));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [progressState, setProgressState] = useState<ProgressState>({ stepIndex: 0 });
  const [error, setError] = useState<string | null>(null);

  const projectLogs = useMemo(
    () => logs.filter((l) => l.projectId === project.id),
    [logs, project.id],
  );

  const logMap = useMemo(() => {
    const m = new Map<string, LogEntry>();
    for (const l of logs) m.set(l.id, l);
    return m;
  }, [logs]);

  const handleGenerate = async () => {
    if (projectLogs.length === 0) return;
    setLoading(true);
    setError(null);
    setProgress(t('kbGenerating', lang));
    setProgressState({ stepIndex: 0 });

    try {
      const result = await generateKnowledgeBase(
        project.id,
        projectLogs,
        (p: KBProgress) => {
          if (p.phase === 'extract') {
            setProgress(tf('kbExtracting', lang, p.current, p.total));
            setProgressState({ stepIndex: 0, detail: tf('kbExtracting', lang, p.current, p.total) });
          } else {
            setProgress(t('kbAnalyzing', lang));
            setProgressState({ stepIndex: 1 });
          }
        },
      );
      saveKnowledgeBase(result);
      setKb(result);
      showToast(t('saved', lang), 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  // Empty state
  if (!kb && !loading) {
    return (
      <div className="workspace-content">
        <div className="page-header">
          <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
            ← {t('kbBack', lang)}
          </button>
          <div className="page-header-row">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={22} />
                {t('kbTitle', lang)}
              </h2>
              <p className="page-subtitle">{project.name}</p>
            </div>
          </div>
        </div>
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="empty-state-icon">&#128218;</div>
          <p>{t('kbEmpty', lang)}</p>
          <p className="page-subtitle">{t('kbEmptyDesc', lang)}</p>
          {error && <p style={{ color: 'var(--error-text)', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={projectLogs.length === 0}
            style={{ marginTop: 16 }}
          >
            <BookOpen size={14} />
            {projectLogs.length === 0 ? t('kbNoLogs', lang) : t('kbGenerate', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-content">
      {/* Header */}
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('kbBack', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={22} />
              {t('kbTitle', lang)}
            </h2>
            <p className="page-subtitle">{project.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn"
              onClick={handleGenerate}
              disabled={loading || projectLogs.length === 0}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              {loading ? progress : t('kbRegenerate', lang)}
            </button>
          </div>
        </div>
        {kb && (
          <div className="meta" style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 12 }}>
            <span>{tf('kbUpdatedAt', lang, formatDate(kb.generatedAt, lang))}</span>
            <span>{tf('kbLogCount', lang, kb.logCount)}</span>
          </div>
        )}
      </div>

      {loading && !kb && (
        <ProgressPanel
          steps={[
            { label: t('kbGenerating', lang), duration: 5000 },
            { label: t('kbAnalyzing', lang), duration: 8000 },
          ]}
          state={progressState}
          lang={lang}
        />
      )}

      {error && (
        <div className="content-card" style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)', marginBottom: 16 }}>
          <p style={{ color: 'var(--error-text)', fontSize: 13 }}>{error}</p>
        </div>
      )}

      {kb && (
        <>
          {/* Recurring Problems & Solutions */}
          {kb.patterns.length > 0 && (
            <div className="content-card" style={{ marginBottom: 20 }}>
              <h3 className="kb-section-title">
                <AlertCircle size={16} />
                {t('kbPatterns', lang)}
              </h3>
              <div className="kb-patterns">
                {kb.patterns.map((pattern, i) => (
                  <div key={i} className="kb-pattern-card">
                    <div className="kb-pattern-header">
                      <span className="kb-pattern-freq">{tf('kbFrequency', lang, pattern.frequency)}</span>
                    </div>
                    <div className="kb-pattern-row">
                      <span className="kb-label kb-label-problem">{t('kbProblem', lang)}</span>
                      <span className="kb-pattern-text">{pattern.problem}</span>
                    </div>
                    <div className="kb-pattern-row">
                      <span className="kb-label kb-label-solution">{t('kbSolution', lang)}</span>
                      <span className="kb-pattern-text">{pattern.solution}</span>
                    </div>
                    {pattern.sourceLogIds.length > 0 && (
                      <div className="kb-source-logs">
                        {pattern.sourceLogIds.map((logId) => {
                          const log = logMap.get(logId);
                          if (!log) return null;
                          return (
                            <button key={logId} className="btn-link kb-source-link" onClick={() => onOpenLog(logId)}>
                              <ExternalLink size={10} />
                              {log.title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best Practices */}
          {kb.bestPractices.length > 0 && (
            <div className="content-card" style={{ marginBottom: 20 }}>
              <h3 className="kb-section-title">
                <Lightbulb size={16} />
                {t('kbBestPractices', lang)}
              </h3>
              <ul className="kb-list">
                {kb.bestPractices.map((bp, i) => (
                  <li key={i} className="kb-list-item kb-list-item-practice">
                    {bp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Common Decisions */}
          {kb.commonDecisions.length > 0 && (
            <div className="content-card" style={{ marginBottom: 20 }}>
              <h3 className="kb-section-title">
                <CheckCircle2 size={16} />
                {t('kbCommonDecisions', lang)}
              </h3>
              <ul className="kb-list">
                {kb.commonDecisions.map((d, i) => (
                  <li key={i} className="kb-list-item">
                    <span>{d.text}</span>
                    {d.sourceLogIds.length > 0 && (
                      <div className="kb-source-logs">
                        {d.sourceLogIds.map((logId) => {
                          const log = logMap.get(logId);
                          if (!log) return null;
                          return (
                            <button key={logId} className="btn-link kb-source-link" onClick={() => onOpenLog(logId)}>
                              <ExternalLink size={10} />
                              {log.title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
