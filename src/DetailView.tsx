import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { trashLog, restoreLog, updateLog, loadLogs, duplicateLog, getAiContext, getMasterNote, getFeatureEnabled, safeGetItem } from './storage';
import { saveCorrection } from './classify';
import { MoreVertical, Pin, ExternalLink, Copy, Check, Activity, Share2 } from 'lucide-react';
import { logToMarkdown } from './markdown';
import { playDelete } from './sounds';
import type { LogEntry, Project } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { analyzeWorkload, WORKLOAD_CONFIG } from './workload';
import { formatDateTimeFull } from './utils/dateFormat';
import { formatHandoffMarkdown, formatFullAiContext } from './formatHandoff';
import { generateProjectContext } from './generateProjectContext';
import TodoSection from './components/TodoSection';
import RelatedLogsSection from './components/RelatedLogsSection';
import { CardSection, CheckableCardSection } from './components/CardSection';
import { downloadFile } from './utils/downloadFile';
import { isStaleMasterNote } from './utils/staleness';

function DetailView({ id, onDeleted, onOpenLog, onBack, prevView: _prevView, lang, projects, onRefresh, showToast, onTagFilter, allLogs, onOpenMasterNote }: { id: string; onDeleted: () => void; onOpenLog: (id: string) => void; onBack: () => void; prevView: string; lang: Lang; projects: Project[]; onRefresh: () => void; showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void; onTagFilter?: (tag: string) => void; allLogs: LogEntry[]; onOpenMasterNote?: (projectId: string) => void }) {
  const log = allLogs.find((l) => l.id === id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [todosVersion, setTodosVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  // Memo
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [analyzingWorkload, setAnalyzingWorkload] = useState(false);
  const [sendingNotion, setSendingNotion] = useState(false);
  const [sendingSlack, setSendingSlack] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prev/next navigation
  const sortedLogs = useMemo(
    () => [...allLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allLogs],
  );
  const currentIndex = sortedLogs.findIndex((l) => l.id === id);
  const prevLogId = currentIndex > 0 ? sortedLogs[currentIndex - 1].id : null;
  const nextLogId = currentIndex >= 0 && currentIndex < sortedLogs.length - 1 ? sortedLogs[currentIndex + 1].id : null;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const btn = document.querySelector('[data-menu-trigger="detail"]');
      if (btn && btn.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const close = (e: MouseEvent) => {
      const btn = document.querySelector('[data-menu-trigger="project-picker"]');
      if (btn && btn.contains(e.target as Node)) return;
      setProjectPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [projectPickerOpen]);

  // Find previous handoff in same project for diff highlighting (memoized)
  const prevHandoff = useMemo(() => {
    if (!log || log.outputMode !== 'handoff' || !log.projectId) return null;
    const projectHandoffs = allLogs
      .filter((l) => l.projectId === log.projectId && l.outputMode === 'handoff' && l.id !== log.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const logTime = new Date(log.createdAt).getTime();
    return projectHandoffs.find((l) => new Date(l.createdAt).getTime() < logTime) || null;
  }, [log, allLogs]);

  if (!log) return <div className="workspace-content"><p className="empty-state">{t('logNotFound', lang)}</p></div>;

  const isNewItem = (item: string, prevItems: string[] | undefined): boolean => {
    if (!prevHandoff || !prevItems || prevItems.length === 0) return false;
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\u3000-\u9fff]/g, '');
    const normalizedPrev = prevItems.map(normalize);
    const n = normalize(item);
    return !normalizedPrev.some((p) => p === n || p.includes(n) || n.includes(p));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logToMarkdown(log));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      showToast?.(t('logCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
    setMenuOpen(false);
  };

  const handleCopyWithContext = async () => {
    setMenuOpen(false);
    if (!log.projectId) {
      showToast?.(t('addToProjectFirst', lang), 'default');
      return;
    }
    const ctx = getAiContext(log.projectId);
    if (!ctx) {
      showToast?.(t('aiContextNeeded', lang), 'default');
      return;
    }
    try {
      const md = logToMarkdown(log);
      await navigator.clipboard.writeText(ctx + '\n\n---\n\n## Latest Handoff\n' + md);
      showToast?.(t('logCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    setConfirmDelete(true);
  };

  const handleDetailExport = (format: 'md' | 'json') => {
    const date = new Date(log.createdAt).toISOString().slice(0, 10);
    const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
    if (format === 'md') {
      downloadFile(logToMarkdown(log), `threadlog-${date}-${type}.md`, 'text/markdown');
    } else {
      const { sourceText: _sourceText, ...exportData } = log; // omit sourceText from export
      downloadFile(JSON.stringify(exportData, null, 2), `threadlog-${date}-${type}.json`, 'application/json');
    }
    setMenuOpen(false);
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const markdown = logToMarkdown(log);
    try {
      await navigator.share({
        title: log.title,
        text: markdown,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        try { navigator.clipboard.writeText(markdown); } catch { /* non-critical */ }
        showToast?.(t('copiedToClipboard', lang), 'success');
      }
    }
  };

  const handleAssignProject = (projectId: string) => {
    const newProjectId = projectId || undefined;
    updateLog(id, { projectId: newProjectId, suggestedProjectId: undefined });
    if (newProjectId && log) saveCorrection(log, newProjectId);
    setProjectPickerOpen(false);
    onRefresh();
    // Prompt to update Project Summary when a log is assigned
    if (newProjectId) {
      const mn = getMasterNote(newProjectId);
      const isStale = mn && isStaleMasterNote(mn.updatedAt);
      const msg = isStale ? t('updateSummaryStale', lang) : t('updateSummaryPrompt', lang);
      showToast?.(msg, 'default', onOpenMasterNote ? {
        label: t('updateSummaryAction', lang),
        onClick: () => onOpenMasterNote(newProjectId),
      } : undefined);
    }
  };

  const flashSaved = () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setShowSaved(true);
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
  };

  const handleTitleSave = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== log?.title) {
      updateLog(id, { title: trimmed, updatedAt: new Date().toISOString() });
      onRefresh();
      flashSaved();
    }
    setEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditingTitle(false);
  };

  const handleMemoSave = () => {
    updateLog(id, { memo: memoDraft.trim() || undefined, updatedAt: new Date().toISOString() });
    setEditingMemo(false);
    onRefresh();
    flashSaved();
  };

  const handleAnalyzeWorkload = async () => {
    if (!log) return;
    setAnalyzingWorkload(true);
    try {
      const level = await analyzeWorkload(log);
      updateLog(id, { workloadLevel: level });
      onRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setAnalyzingWorkload(false);
    }
  };

  const handleSendNotion = async () => {
    if (!log) return;
    if (!(safeGetItem('threadlog_notion_api_key') && safeGetItem('threadlog_notion_database_id'))) {
      showToast?.(t('notionNotConfigured', lang), 'error');
      return;
    }
    setSendingNotion(true);
    try {
      const { sendToNotion } = await import('./integrations');
      await sendToNotion(log);
      showToast?.(t('notionSent', lang), 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingNotion(false);
    }
  };

  const handleSendSlack = async () => {
    if (!log) return;
    if (!safeGetItem('threadlog_slack_webhook_url')) {
      showToast?.(t('slackNotConfigured', lang), 'error');
      return;
    }
    setSendingSlack(true);
    try {
      const { sendToSlack } = await import('./integrations');
      await sendToSlack(logToMarkdown(log));
      showToast?.(t('slackSent', lang), 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingSlack(false);
    }
  };

  const isHandoff = log.outputMode === 'handoff';
  const project = log.projectId ? projects.find((p) => p.id === log.projectId) : undefined;

  return (
    <div className="workspace-content">
      <div className="page-header">
        <nav className="flex-row flex-wrap mb-md detail-breadcrumb">
          <span
            className="text-muted cursor-pointer"
            onClick={onBack}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBack(); } }}
          >
            {t('logs', lang)}
          </span>
          {project && (
            <>
              <span className="breadcrumb-sep">{' › '}</span>
              <span
                className="text-muted"
                style={{ cursor: onOpenMasterNote ? 'pointer' : 'default' }}
                onClick={() => onOpenMasterNote?.(project.id)}
                role={onOpenMasterNote ? 'button' : undefined}
                tabIndex={onOpenMasterNote ? 0 : undefined}
                onKeyDown={onOpenMasterNote ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenMasterNote(project.id); } } : undefined}
              >
                {project.icon && <span style={{ marginRight: 3 }}>{project.icon}</span>}
                {project.name}
              </span>
            </>
          )}
          <span className="breadcrumb-sep">{' › '}</span>
          <span
            className="breadcrumb-current"
            title={log.title}
          >
            {log.title}
          </span>
        </nav>
        <div className="page-header-row">
          <div className="flex-1">
            <div className="flex-row gap-10">
              {isHandoff ? <span className="badge-handoff">Handoff</span> : <span className="badge-worklog">Log</span>}
              {project && (
                <span
                  className="tag detail-project-tag"
                  onClick={() => onOpenMasterNote?.(project.id)}
                  title={t('viewProjectSummary', lang)}
                >
                  {project.icon && <span className="detail-project-icon">{project.icon}</span>}
                  {project.name}
                  <span className="detail-arrow-indicator">→</span>
                </span>
              )}
            </div>
            <div className="flex-row flex-wrap text-sm-muted mb-sm gap-12">
              <span>{t('logCreatedAt', lang)}：{formatDateTimeFull(log.createdAt)}</span>
              {log.updatedAt && <span>{t('logUpdatedAt', lang)}：{formatDateTimeFull(log.updatedAt)}</span>}
              {/* Workload level */}
              {!getFeatureEnabled('workload', true) ? null : log.workloadLevel ? (
                <span
                  className="detail-workload-badge"
                  style={{
                    color: WORKLOAD_CONFIG[log.workloadLevel].color,
                    background: WORKLOAD_CONFIG[log.workloadLevel].bg,
                  }}
                  onClick={handleAnalyzeWorkload}
                  title={t('clickToReanalyze', lang)}
                >
                  <Activity size={10} />
                  {t('workloadLevel', lang)}: {WORKLOAD_CONFIG[log.workloadLevel].label(lang)}
                </span>
              ) : (
                <button
                  className="btn detail-workload-btn"
                  onClick={handleAnalyzeWorkload}
                  disabled={analyzingWorkload}
                >
                  <Activity size={10} />
                  {analyzingWorkload ? t('workloadAnalyzing', lang) : t('workloadAnalyze', lang)}
                </button>
              )}
            </div>
            <div className="flex detail-title-area">
              {editingTitle ? (
                <input
                  className="input detail-title-input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); handleTitleSave(); }
                    if (e.key === 'Escape') handleTitleCancel();
                  }}
                  autoFocus
                  maxLength={200}
                />
              ) : (
                <h2
                  className="flex-1 truncate detail-title"
                  onClick={() => { setTitleDraft(log.title); setEditingTitle(true); }}
                  title={log.title}
                >
                  {log.title}
                </h2>
              )}
              {showSaved && (
                <span className="detail-saved-indicator">
                  <Check size={14} />
                  {t('detailSaved', lang)}
                </span>
              )}
              <button
                className="card-menu-btn detail-pin-btn"
                onClick={() => {
                  if (!log.pinned) {
                    const pinnedCount = loadLogs().filter((l) => l.pinned).length;
                    if (pinnedCount >= 5) { showToast?.(t('pinLimitReached', lang), 'error'); return; }
                  }
                  updateLog(id, { pinned: !log.pinned }); onRefresh();
                }}
                style={log.pinned ? { color: 'var(--accent)' } : undefined}
                title={log.pinned ? t('titleUnpin', lang) : t('titlePin', lang)}
                aria-label={log.pinned ? t('ariaUnpin', lang) : t('ariaPin', lang)}
              >
                <Pin size={18} style={{ transform: 'rotate(45deg)' }} fill={log.pinned ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
          {/* AI Context copy — primary action */}
          {isHandoff && log.projectId && (
            <button
              className="btn btn-primary flex-row shrink-0 detail-ai-copy-btn"
              onClick={handleCopyWithContext}
              title={t('copyAiContextTitle', lang)}
            >
              <Copy size={13} />
              {t('copyAiContext', lang)}
            </button>
          )}
          <div className="shrink-0 relative">
            <button
              className="card-menu-btn"
              data-menu-trigger="detail"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              title={t('titleActions', lang)}
              aria-label={t('ariaMenu', lang)}
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                {projects.length > 0 && (
                  <button className="card-menu-item" onClick={() => { setMenuOpen(false); setProjectPickerOpen(true); }}>
                    {t('editProject', lang)}
                  </button>
                )}
                <button className="card-menu-item" onClick={handleCopy}>
                  {copied ? t('copied', lang) : t('copyMarkdown', lang)}
                </button>
                <button className="card-menu-item" onClick={handleCopyWithContext}>
                  {t('copyWithContext', lang)}
                </button>
                <button className="card-menu-item" onClick={() => handleDetailExport('md')}>
                  {t('exportMd', lang)}
                </button>
                <button className="card-menu-item" onClick={() => handleDetailExport('json')}>
                  {t('exportJson', lang)}
                </button>
                {typeof navigator.share === 'function' && (
                  <button className="card-menu-item" onClick={handleShare}>
                    <Share2 size={14} /> {t('share', lang)}
                  </button>
                )}
                <button className="card-menu-item" onClick={() => {
                  setMenuOpen(false);
                  const suffix = t('duplicateLogSuffix', lang);
                  const newId = duplicateLog(id, suffix);
                  if (newId) {
                    onRefresh();
                    showToast?.(t('duplicateLogDone', lang), 'success');
                    onOpenLog(newId);
                  }
                }}>
                  {t('duplicateLog', lang)}
                </button>
                <button className="card-menu-item card-menu-item-danger" onClick={handleDelete}>
                  {t('delete', lang)}
                </button>
              </div>
            )}
            {projectPickerOpen && (
              <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="card-menu-item"
                    onClick={() => handleAssignProject(p.id)}
                    style={log.projectId === p.id ? { fontWeight: 600, color: 'var(--accent-text)' } : undefined}
                  >
                    {p.name}
                  </button>
                ))}
                <button className="card-menu-item text-placeholder" onClick={() => handleAssignProject('')}>
                  {t('removeFromProject', lang)}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {log.tags.length > 0 && (
        <div className="flex flex-wrap mb-lg gap-4">
          {log.tags.map((tag, i) => (
            <span
              key={i}
              className="tag"
              style={{ cursor: onTagFilter ? 'pointer' : undefined }}
              onClick={onTagFilter ? () => onTagFilter(tag) : undefined}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Handoff copy buttons + Resume Context hero */}
      {isHandoff && (
        <>
          <div className="flex gap-sm mb-md">
            <button
              className="btn flex-row gap-6"
              onClick={async () => {
                try {
                  const handoffMd = formatHandoffMarkdown(log);
                  await navigator.clipboard.writeText(handoffMd);
                  showToast?.(t('logCopied', lang), 'success');
                } catch {
                  showToast?.(t('copyFailed', lang), 'error');
                }
              }}
            >
              <Copy size={14} />
              {t('copyHandoff', lang)}
            </button>
            {log.projectId && projects.find(p => p.id === log.projectId) && (
              <button
                className="btn btn-primary flex-row gap-6"
                title={t('copyAiContextTitle', lang)}
                onClick={async () => {
                  try {
                    const project = projects.find(p => p.id === log.projectId);
                    const mn = getMasterNote(log.projectId!);
                    if (!project || !mn) { showToast?.(t('aiContextNeeded', lang), 'default'); return; }
                    const freshLogs = loadLogs();
                    const ctx = generateProjectContext(mn, freshLogs, project.name);
                    const aiContextMd = formatFullAiContext(ctx, log);
                    const handoffMd = formatHandoffMarkdown(log);
                    await navigator.clipboard.writeText(aiContextMd + '\n\n---\n\n' + handoffMd);
                    showToast?.(t('logCopied', lang), 'success');
                  } catch {
                    showToast?.(t('copyFailed', lang), 'error');
                  }
                }}
              >
                <Copy size={14} />
                {t('copyAiContext', lang)}
              </button>
            )}
          </div>
          {/* Session Context (handoffMeta) */}
          {log.handoffMeta && (log.handoffMeta.sessionFocus || log.handoffMeta.whyThisSession || log.handoffMeta.timePressure) && (
            <div className="resume-context-hero resume-hero-mb-sm">
              <div className="resume-context-hero-label">{lang === 'ja' ? 'セッション概要' : 'Session Context'}</div>
              <div className="resume-context-hero-body">
                {[
                  log.handoffMeta.sessionFocus && `Focus: ${log.handoffMeta.sessionFocus}`,
                  log.handoffMeta.whyThisSession && `Why: ${log.handoffMeta.whyThisSession}`,
                  log.handoffMeta.timePressure && `Time: ${log.handoffMeta.timePressure}`,
                ].filter(Boolean).join('\n')}
              </div>
            </div>
          )}
          {/* Resume Checklist (structured or legacy) */}
          {(() => {
            if (log.resumeChecklist && log.resumeChecklist.length > 0) {
              return (
                <div className="resume-context-hero resume-hero-mb-md">
                  <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
                  <div className="resume-context-hero-body">
                    {log.resumeChecklist.map((item, i) => {
                      const parts = [item.action];
                      if (item.whyNow) parts.push(`  → ${item.whyNow}`);
                      if (item.ifSkipped) parts.push(`  ⚠ ${item.ifSkipped}`);
                      return `${i + 1}. ${parts.join('\n')}`;
                    }).join('\n')}
                  </div>
                </div>
              );
            }
            const resumeItems = log.resumeContext || (log.resumePoint ? [log.resumePoint] : []);
            return resumeItems.length > 0 ? (
              <div className="resume-context-hero resume-hero-mb-md">
                <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
                <div className="resume-context-hero-body">{resumeItems.join('\n')}</div>
              </div>
            ) : null;
          })()}
        </>
      )}

      {/* External integrations */}
      {(!!(safeGetItem('threadlog_notion_api_key') && safeGetItem('threadlog_notion_database_id')) || !!safeGetItem('threadlog_slack_webhook_url')) && (
        <div className="flex flex-wrap gap-sm mb-md">
          {!!(safeGetItem('threadlog_notion_api_key') && safeGetItem('threadlog_notion_database_id')) && (
            <button
              className="btn flex-row detail-integration-btn"
              onClick={handleSendNotion}
              disabled={sendingNotion}
            >
              <ExternalLink size={12} />
              {sendingNotion ? t('notionSending', lang) : t('notionSend', lang)}
            </button>
          )}
          {!!safeGetItem('threadlog_slack_webhook_url') && (
            <button
              className="btn flex-row detail-integration-btn"
              onClick={handleSendSlack}
              disabled={sendingSlack}
            >
              <ExternalLink size={12} />
              {sendingSlack ? t('slackSending', lang) : t('slackSend', lang)}
            </button>
          )}
        </div>
      )}

      <div className="flex-col gap-md">
        {isHandoff ? (
          <>
            <CardSection title={t('sectionCurrentStatus', lang)} items={log.currentStatus || log.inProgress || []} isNew={(item) => isNewItem(item, prevHandoff?.currentStatus)} />
            <CheckableCardSection
              title={t('sectionNextActions', lang)}
              items={log.nextActions || []}
              richItems={log.nextActionItems}
              checkedIndices={log.checkedActions || []}
              onToggle={(index) => {
                const current = log.checkedActions || [];
                const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
                updateLog(log.id, { checkedActions: next });
                onRefresh();
              }}
            />
            {log.actionBacklog && log.actionBacklog.length > 0 && (
              <CardSection title={lang === 'ja' ? 'バックログ' : 'Action Backlog'} items={log.actionBacklog.map(a => a.action)} />
            )}
            <CardSection title={t('sectionCompleted', lang)} items={log.completed || []} isNew={(item) => isNewItem(item, prevHandoff?.completed)} />
            <CardSection title={t('sectionDecisions', lang)} items={log.decisions} isNew={(item) => isNewItem(item, prevHandoff?.decisions)} />
            <CardSection title={t('sectionBlockers', lang)} items={log.blockers || []} isNew={(item) => isNewItem(item, prevHandoff?.blockers)} />
            <CardSection title={t('sectionConstraints', lang)} items={log.constraints || []} />
          </>
        ) : (
          <>
            <CardSection title={t('sectionToday', lang)} items={log.today} />
            <CardSection title={t('sectionDecisions', lang)} items={log.decisions} />
            <TodoSection logId={log.id} lang={lang} todosVersion={todosVersion} onToggle={() => setTodosVersion((v) => v + 1)} />
            <CardSection title={t('sectionRelatedProjects', lang)} items={log.relatedProjects} />
          </>
        )}

        {log.sourceReference && (
          <div className="content-card flex flex-wrap detail-source-ref">
            {log.sourceReference.fileName && <span>{log.sourceReference.fileName}</span>}
            {log.sourceReference.charCount != null && <span>{log.sourceReference.charCount.toLocaleString()} {t('chars', lang)}</span>}
            {log.sourceReference.originalDate && <span>{log.sourceReference.originalDate}</span>}
          </div>
        )}
        {!log.sourceReference && log.sourceText && (
          <details className="source-details mt-sm">
            <summary>{t('sourceText', lang)}</summary>
            <pre>{log.sourceText}</pre>
          </details>
        )}

        <RelatedLogsSection log={log} onOpenLog={onOpenLog} lang={lang} allLogs={allLogs} />

        {/* Memo section */}
        <div className="content-card">
          <div className="flex-row justify-between" style={{ marginBottom: editingMemo || log.memo ? 8 : 0 }}>
            <div className="content-card-header content-card-header-inline">{t('memoSection', lang)}</div>
            {!editingMemo && (
              <button
                className="btn detail-memo-edit-btn"
                onClick={() => { setMemoDraft(log.memo || ''); setEditingMemo(true); }}
              >
                {t('memoEdit', lang)}
              </button>
            )}
          </div>
          {editingMemo ? (
            <div>
              <textarea
                className="input detail-memo-textarea"
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                placeholder={t('memoPlaceholder', lang)}
                autoFocus
                rows={4}
                maxLength={10000}
              />
              <div className="flex gap-sm mt-sm justify-end">
                <button className="btn detail-memo-action-btn" onClick={() => setEditingMemo(false)}>{t('cancel', lang)}</button>
                <button className="btn btn-primary detail-memo-action-btn" onClick={handleMemoSave}>{t('memoSave', lang)}</button>
              </div>
            </div>
          ) : log.memo ? (
            <p className="text-body detail-memo-text">{log.memo}</p>
          ) : (
            <p
              className="meta detail-memo-placeholder"
              onClick={() => { setMemoDraft(''); setEditingMemo(true); }}
            >
              {t('memoPlaceholder', lang)}
            </p>
          )}
        </div>
      </div>
      {/* Prev/Next navigation */}
      {(prevLogId || nextLogId) && (
        <div className="flex-row justify-between border-top detail-nav-bar">
          <button
            className="btn detail-nav-btn"
            style={{ visibility: prevLogId ? 'visible' : 'hidden' }}
            disabled={!prevLogId}
            onClick={() => prevLogId && onOpenLog(prevLogId)}
          >
            {t('prevLog', lang)}
          </button>
          <button
            className="btn detail-nav-btn"
            style={{ visibility: nextLogId ? 'visible' : 'hidden' }}
            disabled={!nextLogId}
            onClick={() => nextLogId && onOpenLog(nextLogId)}
          >
            {t('nextLog', lang)}
          </button>
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteConfirm', lang)}
          description={t('deleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { const deletedId = log.id; trashLog(deletedId); setConfirmDelete(false); onDeleted(); playDelete(); showToast?.(t('movedToTrash', lang), 'success', { label: t('undo', lang), onClick: () => { restoreLog(deletedId); onRefresh(); } }); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

export default memo(DetailView);
