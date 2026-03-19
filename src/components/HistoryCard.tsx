import { useState, useEffect, useRef, memo } from 'react';
import { MoreHorizontal, Pin, FolderOpen, Pencil, Trash2, Copy, Download, ExternalLink, CopyPlus } from 'lucide-react';
import type { LogEntry, Project } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { updateLog } from '../storage';
import { getProjectColor } from '../projectColors';
import { formatRelativeTime } from '../utils/dateFormat';

// ─── Highlight component ───
export const Highlight = memo(function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const q = query.trim().toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const idx = remaining.toLowerCase().indexOf(q);
    if (idx === -1) {
      parts.push({ text: remaining, match: false });
      break;
    }
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), match: false });
    parts.push({ text: remaining.slice(idx, idx + q.length), match: true });
    remaining = remaining.slice(idx + q.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.match ? <mark key={i} className="search-highlight">{p.text}</mark> : <span key={i}>{p.text}</span>
      )}
    </>
  );
});

// ─── Helper functions (extracted to historyCardHelpers.ts for fast-refresh compat) ───
import { buildPreview, isToday } from './historyCardHelpers';

// ─── Log Context Menu (inline dropdown) ───
export const LogContextMenu = memo(function LogContextMenu({ log, lang, projects, onClose, onAction }: {
  log: LogEntry;
  lang: Lang;
  projects: Project[];
  onClose: () => void;
  onAction: (action: string, value?: string) => void;
}) {
  const [subMenu, setSubMenu] = useState<'project' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('.action-menu-btn')) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (subMenu) setSubMenu(null);
        else onClose();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, subMenu]);

  if (subMenu === 'project') {
    return (
      <div ref={menuRef} className="dropdown-menu dropdown-anchor min-w-200" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dropdown-menu-header">{t('ctxChangeProject', lang)}</div>
        {projects.map((p) => (
          <button key={p.id} className="mn-export-item" onClick={() => { onAction('assignProject', p.id); onClose(); }}>
            <FolderOpen size={14} />
            <span>{p.name}</span>
            {log.projectId === p.id && <span className="ml-auto text-xs" style={{ color: 'var(--accent-text)' }}>✓</span>}
          </button>
        ))}
        {log.projectId && (
          <>
            <div className="mn-export-divider" />
            <button className="mn-export-item" onClick={() => { onAction('removeProject'); onClose(); }}>
              <span className="text-placeholder text-center" style={{ width: 14 }}>—</span>
              <span>{t('ctxRemoveFromProject', lang)}</span>
            </button>
          </>
        )}
        <div className="mn-export-divider" />
        <button className="mn-export-item" onClick={() => setSubMenu(null)}>
          <span>← {t('back', lang)}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="dropdown-menu dropdown-anchor min-w-200">
      <button className="mn-export-item" onClick={() => { onAction('pin'); onClose(); }}>
        <Pin size={14} className="pin-rotate" />
        <span>{log.pinned ? t('ctxUnpin', lang) : t('ctxPin', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('rename'); onClose(); }}>
        <Pencil size={14} />
        <span>{t('ctxRename', lang)}</span>
      </button>
      <div className="mn-export-divider" />
      {projects.length > 0 && (
        <button className="mn-export-item" onClick={() => setSubMenu('project')}>
          <FolderOpen size={14} />
          <span>{t('ctxChangeProject', lang)}</span>
          <span className="action-meta">→</span>
        </button>
      )}
      <button className="mn-export-item" onClick={() => { onAction('copyMd'); onClose(); }}>
        <Copy size={14} />
        <span>{t('logCopyMarkdown', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('downloadMd'); onClose(); }}>
        <Download size={14} />
        <span>{t('logDownloadMd', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('downloadJson'); onClose(); }}>
        <ExternalLink size={14} />
        <span>{t('logDownloadJson', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('duplicate'); onClose(); }}>
        <CopyPlus size={14} />
        <span>{t('duplicateLog', lang)}</span>
      </button>
      <div className="mn-export-divider" />
      <button className="mn-export-item text-error" onClick={() => { onAction('delete'); onClose(); }}>
        <Trash2 size={14} />
        <span>{t('moveToTrash', lang)}</span>
      </button>
    </div>
  );
});

// ─── Shared render props interface ───
export interface LogRenderContext {
  lang: Lang;
  projects: Project[];
  activeProjectId: string | null;
  compact: boolean;
  selectMode: boolean;
  selected: Set<string>;
  debouncedQuery: string;
  editingLogId: string | null;
  editDraft: string;
  actionSheetLog: LogEntry | null;
  inlinePickerLogId: string | null;
  onCardClick: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSetActionSheetLog: (log: LogEntry | null) => void;
  onLogAction: (log: LogEntry, action: string, value?: string) => void;
  onSetEditDraft: (draft: string) => void;
  onSetEditingLogId: (id: string | null) => void;
  onSetInlinePickerLogId: (id: string | null) => void;
  onRefresh: () => void;
  onOpenProject?: (projectId: string) => void;
  onTagFilter?: (tag: string) => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

// ─── Card view item ───
export const HistoryCardItem = memo(function HistoryCardItem({ log, ctx }: { log: LogEntry; ctx: LogRenderContext }) {
  const {
    lang, projects, activeProjectId, compact, selectMode, selected, debouncedQuery,
    editingLogId, editDraft, actionSheetLog, inlinePickerLogId,
    onCardClick, onToggleSelect, onSetActionSheetLog, onLogAction,
    onSetEditDraft, onSetEditingLogId, onSetInlinePickerLogId,
    onRefresh, onOpenProject, onTagFilter, showToast,
  } = ctx;

  const preview = buildPreview(log);
  const modeLabel = log.outputMode === 'handoff' ? t('badgeSnapshot', lang) : t('badgeLog', lang);
  const today = isToday(log.createdAt);
  const isSelected = selected.has(log.id);
  const projectColor = log.projectId ? getProjectColor(projects.find((p) => p.id === log.projectId)?.color) : undefined;
  return (
    <button type="button" key={log.id} className={`card card-btn${isSelected ? ' card-selected' : ''}`} onClick={() => onCardClick(log.id)} aria-label={t('ariaOpenLog', lang)} style={{ position: 'relative', display: 'flex', gap: selectMode ? 12 : 0, ...(projectColor ? { borderLeft: `3px solid ${projectColor}` } : {}), ...(compact ? { padding: '4px 8px', fontSize: 12, lineHeight: 1.3 } : {}) }}>
      {selectMode && (
        <div className="shrink-0 mt-2">
          <input type="checkbox" className="bulk-checkbox" checked={isSelected} onChange={() => onToggleSelect(log.id)} onClick={(e) => e.stopPropagation()} aria-label={t('ariaBulkCheckbox', lang)} />
        </div>
      )}
      <div className="flex-1">
        {!selectMode && (
          <div className="card-action-pos" onClick={(e) => e.stopPropagation()}>
            <button className="action-menu-btn" aria-label={t('ariaMenu', lang)} onClick={() => onSetActionSheetLog(actionSheetLog?.id === log.id ? null : log)}>
              <MoreHorizontal size={16} />
            </button>
            {actionSheetLog?.id === log.id && (
              <LogContextMenu
                log={log}
                lang={lang}
                projects={projects}
                onClose={() => onSetActionSheetLog(null)}
                onAction={(action, value) => onLogAction(log, action, value)}
              />
            )}
          </div>
        )}
        <div className="flex-row" style={{ gap: compact ? 4 : 8, marginBottom: compact ? 2 : 6 }}>
          {log.pinned && (
            <Pin size={compact ? 10 : 12} className="shrink-0" style={{ color: 'var(--accent)', transform: 'rotate(45deg)' }} />
          )}
          <span className={log.outputMode === 'handoff' ? 'badge-handoff' : 'badge-worklog'}>{modeLabel}</span>
          <span className="meta" style={{ fontSize: 11, color: today ? 'var(--accent-text)' : undefined, fontWeight: today ? 500 : undefined }}>
            {formatRelativeTime(log.createdAt, lang === 'ja' ? 'ja' : 'en')}
          </span>
          {!activeProjectId && log.projectId && (() => {
            const proj = projects.find((p) => p.id === log.projectId);
            return proj ? (
              <button
                type="button"
                className="tag cursor-pointer inline-flex-center"
                style={{ fontSize: 10, gap: 3, background: 'none', border: 'none', padding: 'inherit', fontFamily: 'inherit', color: 'inherit' }}
                onClick={(e) => { e.stopPropagation(); onOpenProject?.(proj.id); }}
              >
                {proj.icon && <span style={{ fontSize: 11 }}>{proj.icon}</span>}
                {proj.name}
              </button>
            ) : null;
          })()}
        </div>
        <div className="card-title-clamp" style={{ fontWeight: 600, fontSize: compact ? 13 : 15, color: 'var(--text-secondary)', lineHeight: compact ? 1.2 : 1.4, paddingRight: 48 }}>
          {editingLogId === log.id ? (
            <input
              className="input w-full"
              style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
              value={editDraft}
              aria-label={t('ariaRenameInput', lang)}
              onChange={(e) => onSetEditDraft(e.target.value)}
              onBlur={() => { if (editDraft.trim() && editDraft.trim() !== log.title) { updateLog(log.id, { title: editDraft.trim() }); onRefresh(); } onSetEditingLogId(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { onSetEditingLogId(null); } }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              maxLength={200}
            />
          ) : (
            <Highlight text={log.title} query={debouncedQuery} />
          )}
        </div>
        {preview && <div className="meta" style={{ marginTop: compact ? 2 : 5, lineHeight: compact ? 1.3 : 1.55, fontSize: compact ? 11 : 12.5 }}><Highlight text={preview} query={debouncedQuery} /></div>}
        {log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0 && (
          <div className="flex-row" style={{ gap: 8, marginTop: 5, fontSize: 12, color: 'var(--text-placeholder)' }}>
            <span className="inline-flex-center" style={{ gap: 4 }}>
              ☑ {log.checkedActions?.length || 0}/{log.nextActions.length}
            </span>
            <div className="handoff-progress-track">
              <div className="handoff-progress-fill" style={{ width: `${((log.checkedActions?.length || 0) / log.nextActions.length) * 100}%` }} />
            </div>
          </div>
        )}
        {!activeProjectId && !log.projectId && projects.length > 0 && (
          <div
            className="flex-row relative"
            style={{ marginTop: 6, gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex-row text-xs-placeholder"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={() => onSetInlinePickerLogId(inlinePickerLogId === log.id ? null : log.id)}
            >
              <FolderOpen size={11} />
              <span style={{ borderBottom: '1px dashed var(--border-subtle)' }}>
                {t('addToProject', lang)}
              </span>
            </button>
            {inlinePickerLogId === log.id && (
              <div className="flex flex-wrap gap-xs" style={{ marginLeft: 4 }}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="tag inline-project-tag"
                    onClick={() => {
                      updateLog(log.id, { projectId: p.id });
                      onSetInlinePickerLogId(null);
                      onRefresh();
                      showToast?.(tf('addedToProject', lang, p.name), 'success');
                    }}
                  >
                    {p.icon && <span style={{ marginRight: 3 }}>{p.icon}</span>}
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {log.tags.length > 0 && (
          <div className="flex flex-wrap" style={{ marginTop: compact ? 3 : 8, gap: compact ? 2 : 4 }}>
            {log.tags.slice(0, 5).map((tg, i) => (
              <button
                type="button"
                key={i}
                className="tag cursor-pointer"
                style={{ ...(compact ? { fontSize: 10, padding: '0px 6px' } : {}), background: 'none', border: 'none', fontFamily: 'inherit', color: 'inherit' }}
                onClick={(e) => { e.stopPropagation(); onTagFilter?.(tg); }}
              >
                <Highlight text={tg} query={debouncedQuery} />
              </button>
            ))}
            {log.tags.length > 5 && <span className="meta text-xs-muted" style={{ alignSelf: 'center' }}>+{log.tags.length - 5}</span>}
          </div>
        )}
      </div>
    </button>
  );
});

// ─── List view item ───
export const HistoryListItem = memo(function HistoryListItem({ log, ctx }: { log: LogEntry; ctx: LogRenderContext }) {
  const {
    lang, projects, compact, selectMode, selected, debouncedQuery,
    editingLogId, editDraft, actionSheetLog,
    onCardClick, onToggleSelect, onSetActionSheetLog, onLogAction,
    onSetEditDraft, onSetEditingLogId, onRefresh,
  } = ctx;

  const modeLabel = log.outputMode === 'handoff' ? 'H' : 'W';
  const isSelected = selected.has(log.id);
  const projectColor = log.projectId ? getProjectColor(projects.find((p) => p.id === log.projectId)?.color) : undefined;
  return (
    <button
      type="button"
      key={log.id}
      className={`list-row list-row-btn${isSelected ? ' list-row-selected' : ''}`}
      style={{ ...(projectColor ? { borderLeft: `3px solid ${projectColor}` } : {}), ...(compact ? { padding: '2px 8px', fontSize: 12, lineHeight: 1.3, minHeight: 28 } : {}) }}
      onClick={() => onCardClick(log.id)}
      aria-label={t('ariaOpenLog', lang)}
    >
      {selectMode && (
        <input type="checkbox" className="bulk-checkbox shrink-0" checked={isSelected} onChange={() => onToggleSelect(log.id)} onClick={(e) => e.stopPropagation()} aria-label={t('ariaBulkCheckbox', lang)} />
      )}
      {log.pinned && <Pin size={compact ? 8 : 10} className="shrink-0" style={{ color: 'var(--accent)', transform: 'rotate(45deg)' }} />}
      <span className={`${log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} shrink-0`} style={compact ? { fontSize: 10 } : undefined}>
        {modeLabel}
      </span>
      <span className="list-row-title" style={compact ? { fontSize: 12 } : undefined}>
        {editingLogId === log.id ? (
          <input
            className="input w-full"
            style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
            value={editDraft}
            aria-label={t('ariaRenameInput', lang)}
            onChange={(e) => onSetEditDraft(e.target.value)}
            onBlur={() => { if (editDraft.trim() && editDraft.trim() !== log.title) { updateLog(log.id, { title: editDraft.trim() }); onRefresh(); } onSetEditingLogId(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { onSetEditingLogId(null); } }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            maxLength={200}
          />
        ) : (
          <Highlight text={log.title} query={debouncedQuery} />
        )}
      </span>
      <span className="meta shrink-0 nowrap" style={{ fontSize: compact ? 10 : 11 }}>{formatRelativeTime(log.createdAt, lang === 'ja' ? 'ja' : 'en')}</span>
      {!selectMode && (
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button className="action-menu-btn" aria-label={t('ariaMenu', lang)} style={{ visibility: 'hidden' }} onClick={() => onSetActionSheetLog(actionSheetLog?.id === log.id ? null : log)}>
            <MoreHorizontal size={14} />
          </button>
          {actionSheetLog?.id === log.id && (
            <LogContextMenu
              log={log}
              lang={lang}
              projects={projects}
              onClose={() => onSetActionSheetLog(null)}
              onAction={(action, value) => onLogAction(log, action, value)}
            />
          )}
        </div>
      )}
    </button>
  );
});
