import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { trashLog, restoreLog, updateLog, getAiContext, getMasterNote, safeGetItem } from './storage';
import { saveCorrection } from './classify';
import { ExternalLink } from 'lucide-react';
import { logToMarkdown } from './markdown';
import { playDelete } from './sounds';
import type { LogEntry, Project } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { analyzeWorkload } from './workload';
import TodoSection from './components/TodoSection';
import RelatedLogsSection from './components/RelatedLogsSection';
import { CardSection, CheckableCardSection } from './components/CardSection';
import { isStaleMasterNote } from './utils/staleness';
import DetailHeader from './components/DetailHeader';
import DetailMenu from './components/DetailMenu';
import HandoffDisplay from './components/HandoffDisplay';

function DetailView({ id, onDeleted, onOpenLog, onBack, prevView: _prevView, lang, projects, onRefresh, showToast, onTagFilter, allLogs, onOpenMasterNote }: { id: string; onDeleted: () => void; onOpenLog: (id: string) => void; onBack: () => void; prevView: string; lang: Lang; projects: Project[]; onRefresh: () => void; showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void; onTagFilter?: (tag: string) => void; allLogs: LogEntry[]; onOpenMasterNote?: (projectId: string) => void }) {
  const log = allLogs.find((l) => l.id === id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [todosVersion, setTodosVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
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
      if (btn && e.target instanceof Node && btn.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const close = (e: MouseEvent) => {
      const btn = document.querySelector('[data-menu-trigger="project-picker"]');
      if (btn && e.target instanceof Node && btn.contains(e.target)) return;
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
      await navigator.clipboard.writeText(ctx + '\n\n---\n\n## Latest Snapshot\n' + md);
      showToast?.(t('logCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    setConfirmDelete(true);
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const markdown = logToMarkdown(log);
    try {
      await navigator.share({ title: log.title, text: markdown });
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
      if (import.meta.env.DEV) console.error('[DetailView] Notion export error:', err);
      showToast?.(t('errorExportFailed', lang), 'error');
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
      if (import.meta.env.DEV) console.error('[DetailView] Slack export error:', err);
      showToast?.(t('errorExportFailed', lang), 'error');
    } finally {
      setSendingSlack(false);
    }
  };

  const isHandoff = log.outputMode === 'handoff';
  const project = log.projectId ? projects.find((p) => p.id === log.projectId) : undefined;

  return (
    <div className="workspace-content">
      <DetailHeader
        log={log}
        project={project}
        isHandoff={isHandoff}
        lang={lang}
        editingTitle={editingTitle}
        titleDraft={titleDraft}
        setTitleDraft={setTitleDraft}
        setEditingTitle={setEditingTitle}
        onTitleSave={handleTitleSave}
        onTitleCancel={handleTitleCancel}
        showSaved={showSaved}
        analyzingWorkload={analyzingWorkload}
        onAnalyzeWorkload={handleAnalyzeWorkload}
        onCopyWithContext={handleCopyWithContext}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        menuOpen={menuOpen}
        menuContent={
          <DetailMenu
            log={log}
            lang={lang}
            menuOpen={menuOpen}
            projectPickerOpen={projectPickerOpen}
            copied={copied}
            projects={projects}
            onCopy={handleCopy}
            onCopyWithContext={handleCopyWithContext}
            onDelete={handleDelete}
            onShare={handleShare}
            onAssignProject={handleAssignProject}
            onOpenLog={onOpenLog}
            onRefresh={onRefresh}
            setMenuOpen={setMenuOpen}
            setProjectPickerOpen={setProjectPickerOpen}
            showToast={showToast}
          />
        }
        onBack={onBack}
        onRefresh={onRefresh}
        showToast={showToast}
        onOpenMasterNote={onOpenMasterNote}
      />

      {log.tags.length > 0 && (
        <div className="flex flex-wrap mb-lg gap-4">
          {log.tags.map((tag, i) => (
            <span
              key={i}
              className="tag"
              style={{ cursor: onTagFilter ? 'pointer' : undefined }}
              onClick={onTagFilter ? () => onTagFilter(tag) : undefined}
              {...(onTagFilter ? {
                role: 'button' as const,
                tabIndex: 0,
                'aria-label': t('filterByTag', lang).replace('{0}', tag),
                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTagFilter(tag); } },
              } : {})}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Handoff copy buttons + Resume Context hero */}
      {isHandoff && (
        <HandoffDisplay
          log={log}
          lang={lang}
          projects={projects}
          showToast={showToast}
        />
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
            <CardSection title={t('sectionCurrentStatus', lang)} items={log.currentStatus || log.inProgress || []} isNew={(item) => isNewItem(item, prevHandoff?.currentStatus)} lang={lang} />
            <CheckableCardSection
              title={t('sectionNextActions', lang)}
              items={log.nextActions || []}
              richItems={log.nextActionItems}
              checkedIndices={log.checkedActions || []}
              lang={lang}
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
            <CardSection title={t('sectionCompleted', lang)} items={log.completed || []} isNew={(item) => isNewItem(item, prevHandoff?.completed)} lang={lang} />
            <CardSection title={t('sectionDecisions', lang)} items={log.decisions} isNew={(item) => isNewItem(item, prevHandoff?.decisions)} lang={lang} />
            <CardSection title={t('sectionBlockers', lang)} items={log.blockers || []} isNew={(item) => isNewItem(item, prevHandoff?.blockers)} lang={lang} />
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
                aria-label={t('memoPlaceholder', lang)}
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
            <button
              type="button"
              className="btn-reset meta detail-memo-placeholder"
              onClick={() => { setMemoDraft(''); setEditingMemo(true); }}
            >
              {t('memoPlaceholder', lang)}
            </button>
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
