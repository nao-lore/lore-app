import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { trashLog, restoreLog, updateLog, loadLogs, duplicateLog, getAiContext, getMasterNote, getFeatureEnabled } from './storage';
import { saveCorrection } from './classify';
import { MoreVertical, Pin, ExternalLink, Copy, Check, Activity, Share2 } from 'lucide-react';
import { logToMarkdown } from './markdown';
import { playDelete } from './sounds';
import type { LogEntry, Project } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { analyzeWorkload, WORKLOAD_CONFIG } from './workload';
import { isNotionConfigured, isSlackConfigured } from './integrations';
import { formatDateTimeFull } from './utils/dateFormat';
import { formatHandoffMarkdown, formatFullAiContext } from './formatHandoff';
import { generateProjectContext } from './generateProjectContext';
import TodoSection from './components/TodoSection';
import RelatedLogsSection from './components/RelatedLogsSection';
import { CardSection, CheckableCardSection } from './components/CardSection';

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const { sourceText: _sourceText, ...exportData } = log; // eslint-disable-line @typescript-eslint/no-unused-vars
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
      if ((err as Error).name !== 'AbortError') {
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
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
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
    if (!isNotionConfigured()) {
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
    if (!isSlackConfigured()) {
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
        <nav className="flex-row flex-wrap" style={{ fontSize: 12, marginBottom: 12, gap: 2 }}>
          <span
            style={{ color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'none' }}
            onClick={onBack}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBack(); } }}
          >
            {t('logs', lang)}
          </span>
          {project && (
            <>
              <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>{' › '}</span>
              <span
                style={{
                  color: 'var(--text-muted)',
                  cursor: onOpenMasterNote ? 'pointer' : 'default',
                }}
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
          <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>{' › '}</span>
          <span
            style={{
              color: 'var(--text-secondary)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 'min(300px, 50vw)',
            }}
            title={log.title}
          >
            {log.title}
          </span>
        </nav>
        <div className="page-header-row">
          <div className="flex-1">
            <div className="flex-row" style={{ gap: 10, marginBottom: 4 }}>
              {isHandoff ? <span className="badge-handoff">Handoff</span> : <span className="badge-worklog">Log</span>}
              {project && (
                <span
                  className="tag"
                  style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  onClick={() => onOpenMasterNote?.(project.id)}
                  title={t('viewProjectSummary', lang)}
                >
                  {project.icon && <span style={{ fontSize: 13 }}>{project.icon}</span>}
                  {project.name}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>→</span>
                </span>
              )}
            </div>
            <div className="flex-row flex-wrap text-sm-muted" style={{ gap: 12, marginBottom: 8 }}>
              <span>{t('logCreatedAt', lang)}：{formatDateTimeFull(log.createdAt)}</span>
              {log.updatedAt && <span>{t('logUpdatedAt', lang)}：{formatDateTimeFull(log.updatedAt)}</span>}
              {/* Workload level */}
              {!getFeatureEnabled('workload', true) ? null : log.workloadLevel ? (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    color: WORKLOAD_CONFIG[log.workloadLevel].color,
                    background: WORKLOAD_CONFIG[log.workloadLevel].bg,
                    cursor: 'pointer',
                  }}
                  onClick={handleAnalyzeWorkload}
                  title={t('clickToReanalyze', lang)}
                >
                  <Activity size={10} />
                  {t('workloadLevel', lang)}: {WORKLOAD_CONFIG[log.workloadLevel].label(lang)}
                </span>
              ) : (
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '1px 8px', minHeight: 20, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={handleAnalyzeWorkload}
                  disabled={analyzingWorkload}
                >
                  <Activity size={10} />
                  {analyzingWorkload ? t('workloadAnalyzing', lang) : t('workloadAnalyze', lang)}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {editingTitle ? (
                <input
                  className="input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); handleTitleSave(); }
                    if (e.key === 'Escape') handleTitleCancel();
                  }}
                  autoFocus
                  maxLength={200}
                  style={{ flex: 1, fontSize: 18, fontWeight: 700, padding: '2px 8px' }}
                />
              ) : (
                <h2
                  className="flex-1 truncate"
                  style={{ margin: 0, cursor: 'pointer' }}
                  onClick={() => { setTitleDraft(log.title); setEditingTitle(true); }}
                  title={log.title}
                >
                  {log.title}
                </h2>
              )}
              {showSaved && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--success-text, #22c55e)', fontWeight: 500, flexShrink: 0, transition: 'opacity 0.3s', whiteSpace: 'nowrap' }}>
                  <Check size={14} />
                  {t('detailSaved', lang)}
                </span>
              )}
              <button
                className="card-menu-btn"
                onClick={() => {
                  if (!log.pinned) {
                    const pinnedCount = loadLogs().filter((l) => l.pinned).length;
                    if (pinnedCount >= 5) { showToast?.(t('pinLimitReached', lang), 'error'); return; }
                  }
                  updateLog(id, { pinned: !log.pinned }); onRefresh();
                }}
                style={log.pinned ? { color: 'var(--accent)', flexShrink: 0, marginTop: 2 } : { flexShrink: 0, marginTop: 2 }}
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
              className="btn btn-primary flex-row shrink-0"
              onClick={handleCopyWithContext}
              style={{ fontSize: 12, padding: '6px 14px', gap: 6, whiteSpace: 'nowrap' }}
              title={t('copyAiContextTitle', lang)}
            >
              <Copy size={13} />
              {t('copyAiContext', lang)}
            </button>
          )}
          <div className="shrink-0" style={{ position: 'relative' }}>
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
                <button className="card-menu-item" style={{ color: 'var(--text-placeholder)' }} onClick={() => handleAssignProject('')}>
                  {t('removeFromProject', lang)}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {log.tags.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
              className="btn flex-row"
              style={{ gap: 6, fontSize: 13 }}
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
                className="btn btn-primary flex-row"
                style={{ gap: 6, fontSize: 13 }}
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
            <div className="resume-context-hero" style={{ marginBottom: 8 }}>
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
                <div className="resume-context-hero" style={{ marginBottom: 16 }}>
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
              <div className="resume-context-hero" style={{ marginBottom: 16 }}>
                <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
                <div className="resume-context-hero-body">{resumeItems.join('\n')}</div>
              </div>
            ) : null;
          })()}
        </>
      )}

      {/* External integrations */}
      {(isNotionConfigured() || isSlackConfigured()) && (
        <div className="flex flex-wrap gap-sm mb-md">
          {isNotionConfigured() && (
            <button
              className="btn flex-row"
              style={{ gap: 6, fontSize: 12, padding: '4px 12px', minHeight: 28 }}
              onClick={handleSendNotion}
              disabled={sendingNotion}
            >
              <ExternalLink size={12} />
              {sendingNotion ? t('notionSending', lang) : t('notionSend', lang)}
            </button>
          )}
          {isSlackConfigured() && (
            <button
              className="btn flex-row"
              style={{ gap: 6, fontSize: 12, padding: '4px 12px', minHeight: 28 }}
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
          <div className="content-card" style={{ fontSize: 12, color: 'var(--text-subtle)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {log.sourceReference.fileName && <span>{log.sourceReference.fileName}</span>}
            {log.sourceReference.charCount != null && <span>{log.sourceReference.charCount.toLocaleString()} {t('chars', lang)}</span>}
            {log.sourceReference.originalDate && <span>{log.sourceReference.originalDate}</span>}
          </div>
        )}
        {!log.sourceReference && log.sourceText && (
          <details className="source-details" style={{ marginTop: 8 }}>
            <summary>{t('sourceText', lang)}</summary>
            <pre>{log.sourceText}</pre>
          </details>
        )}

        <RelatedLogsSection log={log} onOpenLog={onOpenLog} lang={lang} allLogs={allLogs} />

        {/* Memo section */}
        <div className="content-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingMemo || log.memo ? 8 : 0 }}>
            <div className="content-card-header" style={{ margin: 0 }}>{t('memoSection', lang)}</div>
            {!editingMemo && (
              <button
                className="btn"
                style={{ fontSize: 12, padding: '2px 10px', minHeight: 24 }}
                onClick={() => { setMemoDraft(log.memo || ''); setEditingMemo(true); }}
              >
                {t('memoEdit', lang)}
              </button>
            )}
          </div>
          {editingMemo ? (
            <div>
              <textarea
                className="input"
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                placeholder={t('memoPlaceholder', lang)}
                autoFocus
                rows={4}
                maxLength={10000}
                style={{ width: '100%', resize: 'vertical', fontSize: 14, lineHeight: 1.6 }}
              />
              <div className="flex gap-sm" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => setEditingMemo(false)}>{t('cancel', lang)}</button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleMemoSave}>{t('memoSave', lang)}</button>
              </div>
            </div>
          ) : log.memo ? (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{log.memo}</p>
          ) : (
            <p
              className="meta"
              style={{ fontSize: 13, cursor: 'pointer', margin: 0 }}
              onClick={() => { setMemoDraft(''); setEditingMemo(true); }}
            >
              {t('memoPlaceholder', lang)}
            </p>
          )}
        </div>
      </div>
      {/* Prev/Next navigation */}
      {(prevLogId || nextLogId) && (
        <div className="flex-row justify-between" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <button
            className="btn"
            style={{ fontSize: 13, visibility: prevLogId ? 'visible' : 'hidden' }}
            disabled={!prevLogId}
            onClick={() => prevLogId && onOpenLog(prevLogId)}
          >
            {t('prevLog', lang)}
          </button>
          <button
            className="btn"
            style={{ fontSize: 13, visibility: nextLogId ? 'visible' : 'hidden' }}
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
