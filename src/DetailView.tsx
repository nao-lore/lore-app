import { useState, useRef, useEffect, memo } from 'react';
import { getLog, trashLog, restoreLog, updateLog, loadTodos, loadLogs, duplicateLog, getAiContext, getMasterNote, getFeatureEnabled, linkLogs, unlinkLogs } from './storage';
import { updateTodo as updateTodoStorage } from './storage';
import { classifyLog as _classifyLog, saveCorrection } from './classify';
void _classifyLog;
import { MoreVertical, Pin, CheckSquare, Square, ExternalLink, Copy, Check, Activity, X, Link, Share2 } from 'lucide-react';
import { logToMarkdown } from './markdown';
import { playDelete } from './sounds';
import type { LogEntry, Project, Todo, NextActionItem } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { analyzeWorkload, WORKLOAD_CONFIG } from './workload';
import { isNotionConfigured, isSlackConfigured } from './integrations';
import { formatDateFull, formatDateTimeFull } from './utils/dateFormat';
import { formatHandoffMarkdown, formatFullAiContext } from './formatHandoff';
import { generateProjectContext } from './generateProjectContext';

const formatDateUnified = formatDateFull;

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function DetailView({ id, onDeleted, onOpenLog, onBack, prevView: _prevView, lang, projects, onRefresh, showToast, onTagFilter, allLogs, onOpenMasterNote }: { id: string; onDeleted: () => void; onOpenLog: (id: string) => void; onBack: () => void; prevView: string; lang: Lang; projects: Project[]; onRefresh: () => void; showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void; onTagFilter?: (tag: string) => void; allLogs: LogEntry[]; onOpenMasterNote?: (projectId: string) => void }) {
  void _prevView;
  const log = getLog(id);
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
  void todosVersion;

  // Prev/next navigation
  const sortedLogs = allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

  if (!log) return <div className="workspace-content"><p className="empty-state">{t('logNotFound', lang)}</p></div>;

  // Find previous handoff in same project for diff highlighting
  const prevHandoff = (() => {
    if (log.outputMode !== 'handoff' || !log.projectId) return null;
    const projectHandoffs = allLogs
      .filter((l) => l.projectId === log.projectId && l.outputMode === 'handoff' && l.id !== log.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const logTime = new Date(log.createdAt).getTime();
    return projectHandoffs.find((l) => new Date(l.createdAt).getTime() < logTime) || null;
  })();

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
      const { sourceText: _s, ...exportData } = log;
      void _s;
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
        <nav style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 12, flexWrap: 'wrap', gap: 2 }}>
          <span
            style={{ color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'none' }}
            onClick={onBack}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onBack(); }}
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
                onKeyDown={onOpenMasterNote ? (e) => { if (e.key === 'Enter') onOpenMasterNote(project.id); } : undefined}
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
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
                  style={{ flex: 1, margin: 0, cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
              className="btn btn-primary"
              onClick={handleCopyWithContext}
              style={{ flexShrink: 0, fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              title={t('copyAiContextTitle', lang)}
            >
              <Copy size={13} />
              {t('copyAiContext', lang)}
            </button>
          )}
          <div style={{ position: 'relative', flexShrink: 0 }}>
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
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
            {log.projectId && (() => {
              const project = projects.find(p => p.id === log.projectId);
              const mn = getMasterNote(log.projectId!);
              if (!project || !mn) return null;
              return (
                <button
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                  title={t('copyAiContextTitle', lang)}
                  onClick={async () => {
                    try {
                      const allLogs = loadLogs();
                      const ctx = generateProjectContext(mn, allLogs, project.name);
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
              );
            })()}
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {isNotionConfigured() && (
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', minHeight: 28 }}
              onClick={handleSendNotion}
              disabled={sendingNotion}
            >
              <ExternalLink size={12} />
              {sendingNotion ? t('notionSending', lang) : t('notionSend', lang)}
            </button>
          )}
          {isSlackConfigured() && (
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', minHeight: 28 }}
              onClick={handleSendSlack}
              disabled={sendingSlack}
            >
              <ExternalLink size={12} />
              {sendingSlack ? t('slackSending', lang) : t('slackSend', lang)}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        <RelatedLogsSection log={log} onOpenLog={onOpenLog} lang={lang} />

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
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
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

// --- Todo Section (checkboxes for worklog detail) ---

function TodoSection({ logId, lang, todosVersion, onToggle }: { logId: string; lang: Lang; todosVersion: number; onToggle: () => void }) {
  void todosVersion;
  const todos = loadTodos().filter((t: Todo) => t.logId === logId);
  if (todos.length === 0) return null;

  const handleToggle = (id: string, done: boolean) => {
    updateTodoStorage(id, { done: !done });
    onToggle();
  };

  return (
    <div className="content-card">
      <div className="content-card-header">{t('sectionTodo', lang)}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map((todo: Todo) => (
          <li
            key={todo.id}
            onClick={() => handleToggle(todo.id, todo.done)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s', margin: '0 -6px' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {todo.done
              ? <CheckSquare size={18} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 1 }} />
              : <Square size={18} style={{ color: 'var(--text-placeholder)', flexShrink: 0, marginTop: 1 }} />
            }
            <span style={{
              color: todo.done ? 'var(--text-placeholder)' : 'var(--text-secondary)',
              textDecoration: todo.done ? 'line-through' : 'none',
            }}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Shared ---

function RelatedLogsSection({ log, onOpenLog, lang }: { log: LogEntry; onOpenLog: (id: string) => void; lang: Lang }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  void refreshKey;

  const allLogs = loadLogs();

  // Explicitly linked logs (bidirectional backlinks)
  const currentLog = getLog(log.id);
  const linkedIds = currentLog?.relatedLogIds || [];
  const linkedLogs = linkedIds
    .map((lid) => allLogs.find((l) => l.id === lid))
    .filter((l): l is LogEntry => !!l);

  // Same-project logs (excluding current and already-linked)
  const linkedIdSet = new Set(linkedIds);
  const projectLogs = log.projectId
    ? allLogs
        .filter((l) => l.projectId === log.projectId && l.id !== log.id && !linkedIdSet.has(l.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8)
    : [];

  // Search candidates (all logs except current and already linked)
  const searchCandidates = searchQuery.trim()
    ? allLogs
        .filter((l) => l.id !== log.id && !linkedIdSet.has(l.id))
        .filter((l) => l.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 10)
    : [];

  const handleLink = (targetId: string) => {
    linkLogs(log.id, targetId);
    setSearchQuery('');
    setSearchOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const handleUnlink = (targetId: string) => {
    unlinkLogs(log.id, targetId);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Close search dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: MouseEvent) => {
      const container = document.querySelector('[data-related-search]');
      if (container && !container.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [searchOpen]);

  const hasLinked = linkedLogs.length > 0;
  const hasProject = projectLogs.length > 0;
  const showSection = hasLinked || hasProject;

  return (
    <div className="content-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSection ? 8 : 0 }}>
        <div className="content-card-header" style={{ margin: 0 }}>{t('relatedLogs', lang)}</div>
        <div style={{ position: 'relative' }} data-related-search>
          <button
            className="btn"
            style={{ fontSize: 12, padding: '2px 10px', minHeight: 24, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); }}
          >
            <Link size={12} />
            {t('linkLog', lang)}
          </button>
          {searchOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100,
              background: 'var(--card-bg)', border: '1px solid var(--border-default)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 'min(320px, calc(100vw - 40px))', maxHeight: 300, overflow: 'hidden',
            }}>
              <div style={{ padding: 8 }}>
                <input
                  ref={searchInputRef}
                  className="input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchLogs', lang)}
                  style={{ width: '100%', fontSize: 13, padding: '6px 10px' }}
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {searchQuery.trim() && searchCandidates.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-placeholder)' }}>
                    {t('noMatches', lang)}
                  </div>
                )}
                {searchCandidates.map((c) => (
                  <button
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontSize: 13, color: 'var(--text-body)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    onClick={() => handleLink(c.id)}
                  >
                    <span className={c.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} style={{ flexShrink: 0 }}>
                      {c.outputMode === 'handoff' ? 'H' : 'L'}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explicitly linked logs */}
      {hasLinked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasProject ? 12 : 0 }}>
          {linkedLogs.map((r) => (
            <span
              key={r.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 16,
                background: 'var(--accent-bg, #f3f0ff)', fontSize: 13,
                border: '1px solid var(--border-default)',
              }}
            >
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? 'H' : 'L'}
              </span>
              <span
                style={{ cursor: 'pointer', color: 'var(--accent-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => onOpenLog(r.id)}
                title={r.title}
              >
                {r.title}
              </span>
              <button
                onClick={() => handleUnlink(r.id)}
                title={t('unlink', lang)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--text-placeholder)', borderRadius: '50%', width: 18, height: 18,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger-text, #e53e3e)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-placeholder)')}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Same-project logs */}
      {hasProject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {projectLogs.map((r) => (
            <button
              key={r.id}
              className="log-link-item"
              onClick={() => onOpenLog(r.id)}
            >
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? '🔁' : '📝'}
              </span>
              <span className="log-link-title">{r.title}</span>
              <span className="meta" style={{ fontSize: 11, flexShrink: 0 }}>
                {formatDateUnified(r.createdAt)}
              </span>
              <ExternalLink size={11} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {!showSection && (
        <p className="meta" style={{ fontSize: 13, margin: 0 }}>
          {t('noMatches', lang)}
        </p>
      )}
    </div>
  );
}

function CardSection({ title, items, isNew }: { title: string; items: string[]; isNew?: (item: string) => boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => {
          const fresh = isNew?.(item);
          return (
            <li key={i} style={{ marginBottom: 6, fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ flex: 1 }}>{item}</span>
              {fresh && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg, #f3f0ff)', padding: '1px 5px', borderRadius: 3, flexShrink: 0, marginTop: 3 }}>NEW</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CheckableCardSection({ title, items, checkedIndices, onToggle, richItems }: { title: string; items: string[]; checkedIndices: number[]; onToggle: (index: number) => void; richItems?: NextActionItem[] }) {
  if (items.length === 0) return null;
  const doneCount = checkedIndices.length;
  return (
    <div className="content-card">
      <div className="content-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        {items.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 500 }}>{doneCount}/{items.length}</span>}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item, i) => {
          const checked = checkedIndices.includes(i);
          const rich = richItems?.[i];
          return (
            <li
              key={i}
              onClick={() => onToggle(i)}
              style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.7, color: checked ? 'var(--text-placeholder)' : 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textDecoration: checked ? 'line-through' : 'none', padding: '4px 0', userSelect: 'none' }}
            >
              <span style={{ flexShrink: 0, marginTop: 3 }}>
                {checked ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} /> : <Square size={16} style={{ color: 'var(--text-placeholder)' }} />}
              </span>
              <span>
                {item}
                {rich && (rich.whyImportant || rich.priorityReason || rich.dueBy || (rich.dependsOn && rich.dependsOn.length > 0)) && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 2 }}>
                    {rich.whyImportant && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                        Why: {rich.whyImportant}
                      </span>
                    )}
                    {rich.priorityReason && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                        Priority: {rich.priorityReason}
                      </span>
                    )}
                    {rich.dependsOn && rich.dependsOn.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
                        Depends on: {rich.dependsOn.join(', ')}
                      </span>
                    )}
                    {rich.dueBy && (
                      <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--bg-card)', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>
                        {rich.dueBy}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(DetailView);
