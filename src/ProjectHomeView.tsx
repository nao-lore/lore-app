import { useState, useMemo, useEffect, useRef } from 'react';
import { FileText, Pin, MoreHorizontal, Copy, Download, Trash2, Pencil, BookOpen, ExternalLink, CopyPlus } from 'lucide-react';
import type { LogEntry, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getMasterNote, getKnowledgeBase, trashLog, updateLog, loadLogs, duplicateLog } from './storage';
import { logToMarkdown } from './markdown';
import ConfirmDialog from './ConfirmDialog';
import { getProjectColor } from './projectColors';
import { formatDateShort } from './utils/dateFormat';

interface ProjectHomeViewProps {
  project: Project;
  logs: LogEntry[];
  onBack: () => void;
  onOpenLog: (id: string) => void;
  onOpenSummary: (projectId: string) => void;
  onOpenKnowledgeBase: (projectId: string) => void;
  onNewLog: () => void;
  onRefresh: () => void;
  lang: Lang;
  showToast: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export default function ProjectHomeView({ project, logs, onBack, onOpenLog, onOpenSummary, onOpenKnowledgeBase, onNewLog, onRefresh, lang, showToast }: ProjectHomeViewProps) {
  const projectLogs = logs
    .filter((l) => l.projectId === project.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const masterNote = getMasterNote(project.id);
  const knowledgeBase = getKnowledgeBase(project.id);
  const [menuLogId, setMenuLogId] = useState<string | null>(null);
  const [showAddLogs, setShowAddLogs] = useState(false);
  const [confirmTrashId, setConfirmTrashId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const PH_PAGE_SIZE = 30;
  const [phVisibleCount, setPhVisibleCount] = useState(PH_PAGE_SIZE);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset pagination when search changes — setState-in-effect is intentional here
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPhVisibleCount(PH_PAGE_SIZE); }, [searchQuery]);

  // Scroll to top when search query changes
  useEffect(() => {
    const scrollContainer = document.querySelector('[data-main-scroll]');
    if (scrollContainer) scrollContainer.scrollTo(0, 0);
  }, [searchQuery]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!menuLogId) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      const trigger = (e.target as HTMLElement).closest('[data-menu-trigger="ph-log"]');
      if (trigger) return;
      setMenuLogId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuLogId(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuLogId]);

  const handleCopyMd = async (log: LogEntry) => {
    try {
      await navigator.clipboard.writeText(logToMarkdown(log));
      showToast(t('logCopied', lang), 'success');
    } catch {
      showToast(t('copyFailed', lang), 'error');
    }
    setMenuLogId(null);
  };

  const handleTrash = (logId: string) => {
    setMenuLogId(null);
    setConfirmTrashId(logId);
  };

  const handleDownloadMd = (log: LogEntry) => {
    const date = new Date(log.createdAt).toISOString().slice(0, 10);
    const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
    const blob = new Blob([logToMarkdown(log)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `threadlog-${date}-${type}.md`; a.click();
    URL.revokeObjectURL(url);
    setMenuLogId(null);
  };

  const handleDownloadJson = (log: LogEntry) => {
    const date = new Date(log.createdAt).toISOString().slice(0, 10);
    const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
    const { sourceText: _sourceText, ...exportData } = log; // omit sourceText from export
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `threadlog-${date}-${type}.json`; a.click();
    URL.revokeObjectURL(url);
    setMenuLogId(null);
  };

  const handleDuplicate = (log: LogEntry) => {
    const suffix = t('duplicateLogSuffix', lang);
    const newId = duplicateLog(log.id, suffix);
    if (newId) {
      onRefresh();
      showToast(t('duplicateLogDone', lang), 'success');
    }
    setMenuLogId(null);
  };

  const handleTogglePin = (log: LogEntry) => {
    if (!log.pinned && loadLogs().filter((l) => l.pinned).length >= 5) {
      showToast(t('pinLimitReached', lang), 'error');
      setMenuLogId(null);
      return;
    }
    updateLog(log.id, { pinned: !log.pinned });
    onRefresh();
    setMenuLogId(null);
  };

  return (
    <div className="workspace-content">
      {/* Header */}
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div className="ph-header-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {project.icon && <span style={{ fontSize: 24 }}>{project.icon}</span>}
              {!project.icon && project.color && (
                <div style={{ width: 6, height: 28, borderRadius: 3, background: getProjectColor(project.color), flexShrink: 0 }} />
              )}
              <h2 className="ph-title" style={{ margin: 0 }}>{project.name}</h2>
            </div>
            <span className="meta" style={{ fontSize: 12 }}>
              {tf('logCount', lang, projectLogs.length)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowAddLogs(true)} style={{ fontSize: 13 }}>
              {t('addLogsToProject', lang)}
            </button>
            <button className="btn btn-primary" onClick={onNewLog} style={{ fontSize: 13 }}>
              {t('createHandoff', lang)}
            </button>
          </div>
        </div>
      </div>

      {/* Summary card */}
      <div
        className="ph-summary-card"
        onClick={() => onOpenSummary(project.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSummary(project.id); } }}
      >
        <div className="ph-summary-icon">
          <FileText size={20} />
        </div>
        <div className="ph-summary-body">
          <div className="ph-summary-title">{t('navProjectSummary', lang)}</div>
          {masterNote ? (
            <p className="ph-summary-text">{masterNote.overview}</p>
          ) : (
            <p className="ph-summary-text ph-summary-empty">
              {tf('projectSummaryAutoGenHint', lang, projectLogs.length)}
            </p>
          )}
          {!masterNote && projectLogs.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 600 }}>
              {t('projectSummaryGenerateLink', lang)}
            </span>
          )}
        </div>
        <span className="ph-summary-arrow">→</span>
      </div>

      {/* Knowledge Base card */}
      <div
        className="ph-summary-card"
        onClick={() => onOpenKnowledgeBase(project.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenKnowledgeBase(project.id); } }}
      >
        <div className="ph-summary-icon" style={{ color: 'var(--warning-text)' }}>
          <BookOpen size={20} />
        </div>
        <div className="ph-summary-body">
          <div className="ph-summary-title">{t('kbTitle', lang)}</div>
          {knowledgeBase ? (
            <p className="ph-summary-text">
              {knowledgeBase.patterns.length > 0
                ? knowledgeBase.patterns[0].problem
                : t('kbDesc', lang)}
              {knowledgeBase.patterns.length > 1 && ` (+${knowledgeBase.patterns.length - 1})`}
            </p>
          ) : (
            <p className="ph-summary-text ph-summary-empty">
              {t('kbEmptyDesc', lang)}
            </p>
          )}
        </div>
        <span className="ph-summary-arrow">→</span>
      </div>

      {/* Search bar + Log list */}
      {projectLogs.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="empty-state-icon">&#128221;</div>
          <p>{t('noLogsYet', lang)}</p>
          <p className="page-subtitle">{t('noLogsYetDesc', lang)}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn" onClick={() => setShowAddLogs(true)}>
              {t('addLogsToProject', lang)}
            </button>
            <button className="btn btn-primary" onClick={onNewLog}>
              {t('createHandoff', lang)}
            </button>
          </div>
        </div>
      ) : (() => {
        const q = searchQuery.trim().toLowerCase();
        const displayLogs = q ? projectLogs.filter((l) => l.title.toLowerCase().includes(q)) : projectLogs;
        return (
        <div className="ph-log-list">
          <div className="ph-section-label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{t('logs', lang)}</span>
            <input
              className="input input-sm"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('ariaSearchLogs', lang)}
              placeholder={t('searchLogs', lang)}
              maxLength={200}
              style={{ flex: 1, minWidth: 100 }}
            />
          </div>
          {displayLogs.length === 0 ? (
            <div className="empty-state">
              <p>{t('noMatches', lang)}</p>
            </div>
          ) : displayLogs.slice(0, phVisibleCount).map((log) => {
            const modeLabel = log.outputMode === 'handoff' ? 'H' : 'W';
            const preview = buildPreview(log);
            return (
              <div
                key={log.id}
                className="ph-log-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpenLog(log.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLog(log.id); } }}
              >
                <div className="ph-log-card-row1">
                  <span className={log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                    {modeLabel}
                  </span>
                  {log.pinned && (
                    <Pin size={10} style={{ color: 'var(--accent)', transform: 'rotate(45deg)', flexShrink: 0 }} />
                  )}
                  {editingLogId === log.id ? (
                    <input
                      className="input"
                      style={{ fontSize: 'inherit', fontWeight: 'inherit', flex: 1, minWidth: 0 }}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => { if (editDraft.trim() && editDraft.trim() !== log.title) { updateLog(log.id, { title: editDraft.trim() }); onRefresh(); } setEditingLogId(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { setEditingLogId(null); } }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      maxLength={200}
                    />
                  ) : (
                    <span className="ph-log-title">{log.title}</span>
                  )}
                  <span className="meta ph-log-date">{formatDateShort(log.createdAt)}</span>
                  <div className="ph-log-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="sidebar-icon-btn"
                      data-menu-trigger="ph-log"
                      onClick={() => setMenuLogId(menuLogId === log.id ? null : log.id)}
                      aria-label={t('ariaMenu', lang)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuLogId === log.id && (
                      <div ref={menuRef} className="dropdown-menu" style={{ top: '100%', right: 0 }} onMouseDown={(e) => e.stopPropagation()}>
                        <button className="mn-export-item" onClick={() => handleTogglePin(log)}>
                          <Pin size={14} style={{ transform: 'rotate(45deg)' }} />
                          <span>{log.pinned ? t('ctxUnpin', lang) : t('ctxPin', lang)}</span>
                        </button>
                        <button className="mn-export-item" onClick={() => { setMenuLogId(null); setEditingLogId(log.id); setEditDraft(log.title); }}>
                          <Pencil size={14} />
                          <span>{t('ctxRename', lang)}</span>
                        </button>
                        <button className="mn-export-item" onClick={() => handleCopyMd(log)}>
                          <Copy size={14} />
                          <span>{t('logCopyMarkdown', lang)}</span>
                        </button>
                        <button className="mn-export-item" onClick={() => handleDownloadMd(log)}>
                          <Download size={14} />
                          <span>{t('logDownloadMd', lang)}</span>
                        </button>
                        <button className="mn-export-item" onClick={() => handleDownloadJson(log)}>
                          <ExternalLink size={14} />
                          <span>{t('logDownloadJson', lang)}</span>
                        </button>
                        <button className="mn-export-item" onClick={() => handleDuplicate(log)}>
                          <CopyPlus size={14} />
                          <span>{t('duplicateLog', lang)}</span>
                        </button>
                        <div className="mn-export-divider" />
                        <button className="mn-export-item" onClick={() => handleTrash(log.id)} style={{ color: 'var(--error-text)' }}>
                          <Trash2 size={14} />
                          <span>{t('moveToTrash', lang)}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {preview && (
                  <p className="ph-log-preview">{preview}</p>
                )}
                {log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--text-placeholder)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ☑ {log.checkedActions?.length || 0}/{log.nextActions.length}
                    </span>
                    <div style={{ flex: 1, height: 3, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', maxWidth: 80 }}>
                      <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${((log.checkedActions?.length || 0) / log.nextActions.length) * 100}%`, transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {displayLogs.length > phVisibleCount && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <button className="btn" onClick={() => setPhVisibleCount((v) => v + PH_PAGE_SIZE)} style={{ fontSize: 13 }}>
                {tf('loadMore', lang, displayLogs.length - phVisibleCount)}
              </button>
            </div>
          )}
        </div>
        );
      })()}

      {showAddLogs && (
        <AddLogsModal
          projectId={project.id}
          logs={logs}
          lang={lang}
          onClose={() => setShowAddLogs(false)}
          onAdded={(count) => {
            onRefresh();
            setShowAddLogs(false);
            showToast(tf('addLogsConfirm', lang, count), 'success');
          }}
        />
      )}
      {confirmTrashId && (
        <ConfirmDialog
          title={t('deleteConfirm', lang)}
          description={t('deleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { trashLog(confirmTrashId); setConfirmTrashId(null); onRefresh(); showToast(t('moveToTrash', lang), 'success'); }}
          onCancel={() => setConfirmTrashId(null)}
        />
      )}
    </div>
  );
}

// ---- Add existing logs modal ----

function AddLogsModal({ projectId, logs, lang, onClose, onAdded }: {
  projectId: string;
  logs: LogEntry[];
  lang: Lang;
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const candidates = useMemo(() =>
    logs
      .filter((l) => l.projectId !== projectId && !l.trashedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [logs, projectId]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((l) => l.title.toLowerCase().includes(q));
  }, [candidates, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    for (const id of selected) {
      updateLog(id, { projectId });
    }
    onAdded(selected.size);
  };

  if (candidates.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">{t('addLogsTitle', lang)}</div>
          <div className="empty-state"><p>{t('addLogsNoUnassigned', lang)}</p></div>
          <div className="modal-footer">
            <button className="btn" onClick={onClose}>{t('addLogsCancel', lang)}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">{t('addLogsTitle', lang)}</div>
        <input
          className="modal-search"
          type="text"
          placeholder={t('addLogsSearchPlaceholder', lang)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          maxLength={200}
        />
        <div className="modal-list">
          {filtered.length === 0 ? (
            <div className="empty-state"><p>{t('addLogsNoResults', lang)}</p></div>
          ) : (
            filtered.map((log) => {
              const modeLabel = log.outputMode === 'handoff' ? 'H' : 'W';
              const checked = selected.has(log.id);
              return (
                <label key={log.id} className={`modal-list-item${checked ? ' modal-list-item-selected' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(log.id)} />
                  <span className={log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                    {modeLabel}
                  </span>
                  <span className="modal-list-title">{log.title}</span>
                  <span className="meta" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>{formatDateShort(log.createdAt)}</span>
                </label>
              );
            })
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('addLogsCancel', lang)}</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={selected.size === 0}>
            {tf('addLogsConfirm', lang, selected.size)}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildPreview(log: LogEntry): string {
  const parts: string[] = [];
  if (log.outputMode === 'handoff') {
    if (log.currentStatus?.length) parts.push(log.currentStatus[0]);
    if (log.nextActions?.length) parts.push('Next: ' + log.nextActions[0]);
  } else {
    if (log.today.length > 0) parts.push(log.today[0]);
    if (log.decisions.length > 0) parts.push(log.decisions[0]);
  }
  const text = parts.join(' / ');
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}
