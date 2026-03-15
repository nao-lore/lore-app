import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePersistedState } from './usePersistedState';
import { MoreHorizontal, Pin, Pencil, Trash2, FolderOpen, Copy, Download, ExternalLink, BookOpen, Calendar, CopyPlus, LayoutGrid, List, TrendingUp } from 'lucide-react';
import type { LogEntry, OutputMode, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { trashLog, updateLog, loadLogs, getMasterNote, duplicateLog } from './storage';
import { logToMarkdown } from './markdown';
import LogPickerModal from './LogPickerModal';
import DropdownMenu from './DropdownMenu';
import ConfirmDialog from './ConfirmDialog';

// ─── Keyword extraction ───
const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'because', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'she', 'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where',
  'how', 'if', 'then', 'also', 'about', 'up', 'out', 'one', 'two',
  'new', 'now', 'way', 'use', 'used', 'using',
  // Japanese particles/common words
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ',
  'さ', 'ある', 'いる', 'する', 'も', 'な', 'よう', 'こと', 'これ',
  'それ', 'もの', 'ため', 'から', 'まで', 'など', 'です', 'ます',
]);

function extractKeywords(logs: LogEntry[]): { word: string; count: number }[] {
  const freq = new Map<string, number>();

  for (const log of logs) {
    // Collect text from tags (high signal)
    for (const tag of log.tags) {
      const lower = tag.toLowerCase().trim();
      if (lower.length >= 2) {
        freq.set(lower, (freq.get(lower) || 0) + 3); // tags get 3x weight
      }
    }

    // Collect from title and content fields
    const texts = [log.title];
    if (log.outputMode === 'handoff') {
      if (log.currentStatus) texts.push(...log.currentStatus);
      if (log.nextActions) texts.push(...log.nextActions);
      if (log.completed) texts.push(...log.completed);
    } else {
      texts.push(...log.today, ...log.decisions);
    }

    for (const text of texts) {
      // Split on non-alphanumeric, keeping CJK characters and alphabetical words
      const words = text.split(/[\s、。,.:;!?()（）「」[\]{}/\-—=+*#@<>]+/);
      for (const raw of words) {
        const w = raw.toLowerCase().trim();
        if (w.length < 2 || STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ─── Highlight component ───
const Highlight = memo(function Highlight({ text, query }: { text: string; query: string }) {
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

// ─── Date filter helpers ───
type DatePreset = 'today' | 'week' | 'month' | 'custom';

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      return { from: fmt(start), to: today };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(start), to: today };
    }
    default:
      return { from: '', to: '' };
  }
}

function matchesDateRange(log: LogEntry, from: string, to: string): boolean {
  const d = log.createdAt.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function buildPreview(log: LogEntry): string {
  const parts: string[] = [];
  if (log.outputMode === 'handoff') {
    const status = log.currentStatus || log.inProgress;
    if (status && status.length > 0) parts.push(status[0]);
    if (log.nextActions && log.nextActions.length > 0) parts.push('Next: ' + log.nextActions[0]);
  } else {
    if (log.today.length > 0) parts.push(log.today[0]);
    if (log.decisions.length > 0) parts.push(log.decisions[0]);
    if (log.todo.length > 0) parts.push('TODO: ' + log.todo[0]);
  }
  return truncate(parts.join(' / '), 140);
}

import { matchesLogQuery } from './search';
import { formatDateFull, formatDateGroup } from './utils/dateFormat';

function matchesQuery(log: LogEntry, query: string): boolean {
  return matchesLogQuery(log, query);
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

type ModeFilter = 'all' | 'pinned' | OutputMode;
type SortKey = 'created' | 'title' | 'type';
type GroupKey = 'none' | 'date' | 'type' | 'project' | 'pinned';

// ─── Log Context Menu (inline dropdown) ───
function LogContextMenu({ log, lang, projects, onClose, onAction }: {
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
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      const trigger = (e.target as HTMLElement).closest('.action-menu-btn');
      if (trigger) return;
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
      <div ref={menuRef} className="dropdown-menu" style={{ top: '100%', right: 0, minWidth: 200 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t('ctxChangeProject', lang)}</div>
        {projects.map((p) => (
          <button key={p.id} className="mn-export-item" onClick={() => { onAction('assignProject', p.id); onClose(); }}>
            <FolderOpen size={14} />
            <span>{p.name}</span>
            {log.projectId === p.id && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-text)' }}>✓</span>}
          </button>
        ))}
        {log.projectId && (
          <>
            <div className="mn-export-divider" />
            <button className="mn-export-item" onClick={() => { onAction('removeProject'); onClose(); }}>
              <span style={{ color: 'var(--text-placeholder)', width: 14, textAlign: 'center' }}>—</span>
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
    <div ref={menuRef} className="dropdown-menu" style={{ top: '100%', right: 0, minWidth: 200 }}>
      <button className="mn-export-item" onClick={() => { onAction('pin'); onClose(); }}>
        <Pin size={14} style={{ transform: 'rotate(45deg)' }} />
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
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>→</span>
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
      <button className="mn-export-item" onClick={() => { onAction('delete'); onClose(); }} style={{ color: 'var(--error-text)' }}>
        <Trash2 size={14} />
        <span>{t('moveToTrash', lang)}</span>
      </button>
    </div>
  );
}

// ─── Main HistoryView ───
interface HistoryViewProps {
  logs: LogEntry[];
  onSelect: (id: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  lang: Lang;
  activeProjectId: string | null;
  projects: Project[];
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  onOpenMasterNote?: (projectId: string) => void;
  onOpenProject?: (projectId: string) => void;
  tagFilter?: string | null;
  onClearTagFilter?: () => void;
  onTagFilter?: (tag: string) => void;
  onDuplicate?: (newId: string) => void;
}

export default function HistoryView({ logs, onSelect, onBack, onRefresh, lang, activeProjectId, projects, showToast, onOpenMasterNote, onOpenProject, tagFilter, onClearTagFilter, onTagFilter, onDuplicate }: HistoryViewProps) {
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [modeFilter, setModeFilter] = usePersistedState<ModeFilter>('threadlog_logs_filter', 'all');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('threadlog_logs_sort', 'created');
  const [groupKey, setGroupKey] = usePersistedState<GroupKey>('threadlog_logs_group', 'none');
  const [viewMode, setViewMode] = usePersistedState<'card' | 'list'>('threadlog_logs_viewmode', 'card');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [logPickerOpen, setLogPickerOpen] = useState(false);
  const [actionSheetLog, setActionSheetLog] = useState<LogEntry | null>(null);
  const [inlinePickerLogId, setInlinePickerLogId] = useState<string | null>(null);
  const [confirmTrashLog, setConfirmTrashLog] = useState<LogEntry | null>(null);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search query by 200ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 200);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const close = () => setProjectPickerOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [projectPickerOpen]);

  useEffect(() => {
    if (!dateFilterOpen) return;
    const close = () => setDateFilterOpen(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDateFilterOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dateFilterOpen]);

  // Scroll to top when filters change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [debouncedQuery, modeFilter, sortKey, groupKey, dateFrom, dateTo, tagFilter]);

  const keywords = useMemo(() => extractKeywords(logs), [logs]);

  // Filter (memoised)
  const filtered = useMemo(() => logs.filter((log) => {
    if (modeFilter === 'pinned' && !log.pinned) return false;
    if (modeFilter !== 'all' && modeFilter !== 'pinned' && (log.outputMode ?? 'worklog') !== modeFilter) return false;
    if (debouncedQuery.trim() && !matchesQuery(log, debouncedQuery.trim())) return false;
    if (tagFilter && !log.tags.includes(tagFilter)) return false;
    if ((dateFrom || dateTo) && !matchesDateRange(log, dateFrom, dateTo)) return false;
    return true;
  }), [logs, modeFilter, debouncedQuery, tagFilter, dateFrom, dateTo]);

  // Sort (pinned first always, memoised)
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    switch (sortKey) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'type': {
        const ta = a.outputMode ?? 'worklog';
        const tb = b.outputMode ?? 'worklog';
        return ta.localeCompare(tb) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'created':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  }), [filtered, sortKey]);

  // Group
  type GroupedEntry = { key: string; label: string; items: LogEntry[] };

  const buildGroups = (): GroupedEntry[] => {
    if (groupKey === 'none') {
      return [{ key: '_all', label: '', items: sorted }];
    }

    const map = new Map<string, { label: string; items: LogEntry[] }>();
    const order: string[] = [];

    for (const log of sorted) {
      let key: string;
      let label: string;

      switch (groupKey) {
        case 'date': {
          key = new Date(log.createdAt).toISOString().slice(0, 10);
          label = formatDateGroup(log.createdAt);
          break;
        }
        case 'type': {
          key = log.outputMode ?? 'worklog';
          label = key === 'handoff' ? t('filterHandoff', lang) : t('filterWorklog', lang);
          break;
        }
        case 'project': {
          key = log.projectId || '_none';
          if (log.projectId) {
            const proj = projects.find((p) => p.id === log.projectId);
            label = proj ? proj.name : log.projectId;
          } else {
            label = t('groupNoProject', lang);
          }
          break;
        }
        case 'pinned': {
          key = log.pinned ? 'pinned' : 'unpinned';
          label = log.pinned ? t('groupPinnedLabel', lang) : t('groupUnpinnedLabel', lang);
          break;
        }
        default:
          key = '_all';
          label = '';
      }

      if (!map.has(key)) {
        map.set(key, { label, items: [] });
        order.push(key);
      }
      map.get(key)!.items.push(log);
    }

    // Pinned group: enforce pinned first
    if (groupKey === 'pinned') {
      return ['pinned', 'unpinned']
        .filter((k) => map.has(k))
        .map((k) => ({ key: k, ...map.get(k)! }));
    }

    return order.map((k) => ({ key: k, ...map.get(k)! }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => buildGroups(), [sorted, groupKey, lang, projects]);

  // Action handlers
  const handleLogAction = (log: LogEntry, action: string, value?: string) => {
    switch (action) {
      case 'pin':
        if (!log.pinned && logs.filter((l) => l.pinned).length >= 5) {
          showToast?.(t('pinLimitReached', lang), 'error');
          break;
        }
        updateLog(log.id, { pinned: !log.pinned });
        onRefresh();
        break;
      case 'rename': {
        const newName = prompt(t('ctxRenamePrompt', lang), log.title);
        if (newName && newName.trim() && newName.trim() !== log.title) {
          updateLog(log.id, { title: newName.trim() });
          onRefresh();
        }
        break;
      }
      case 'assignProject':
        if (value) {
          updateLog(log.id, { projectId: value });
          onRefresh();
        }
        break;
      case 'removeProject':
        updateLog(log.id, { projectId: undefined });
        onRefresh();
        break;
      case 'copyMd':
        navigator.clipboard.writeText(logToMarkdown(log)).then(
          () => showToast?.(t('logCopied', lang), 'success'),
          () => showToast?.(t('copyFailed', lang), 'error'),
        );
        break;
      case 'downloadMd': {
        const date = new Date(log.createdAt).toISOString().slice(0, 10);
        const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
        downloadFile(logToMarkdown(log), `threadlog-${date}-${type}.md`, 'text/markdown');
        break;
      }
      case 'downloadJson': {
        const date2 = new Date(log.createdAt).toISOString().slice(0, 10);
        const type2 = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
        const { sourceText: _s, ...exportData } = log;
        void _s;
        downloadFile(JSON.stringify(exportData, null, 2), `threadlog-${date2}-${type2}.json`, 'application/json');
        break;
      }
      case 'duplicate': {
        const suffix = t('duplicateLogSuffix', lang);
        const newId = duplicateLog(log.id, suffix);
        if (newId) {
          onRefresh();
          showToast?.(t('duplicateLogDone', lang), 'success');
          onDuplicate?.(newId);
        }
        break;
      }
      case 'delete':
        setConfirmTrashLog(log);
        break;
    }
  };

  // Bulk operations
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };
  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((l) => l.id)));
  };
  const handleBulkDelete = () => {
    const count = selected.size;
    if (!window.confirm(tf('bulkTrashConfirm', lang, count))) return;
    for (const id of selected) trashLog(id);
    exitSelectMode();
    onRefresh();
    showToast?.(tf('bulkDeletedToast', lang, count), 'success');
  };
  const handleBulkAssignProject = (projectId: string) => {
    const count = selected.size;
    for (const id of selected) updateLog(id, { projectId: projectId || undefined });
    setProjectPickerOpen(false);
    exitSelectMode();
    onRefresh();
    if (projectId && showToast) {
      const project = projects.find((p) => p.id === projectId);
      const name = project?.name || '';
      showToast(tf('bulkAssignedToast', lang, count, name), 'success');
    }
  };

  const handleCardClick = (id: string) => {
    if (selectMode) toggleSelect(id);
    else onSelect(id);
  };

  const sortOptions = [
    { key: 'created', label: t('sortCreated', lang) },
    { key: 'title', label: t('sortTitle', lang) },
    { key: 'type', label: t('sortType', lang) },
  ];
  const groupOptions = [
    { key: 'none', label: t('groupNone', lang) },
    { key: 'date', label: t('groupDate', lang) },
    { key: 'type', label: t('groupType', lang) },
    { key: 'project', label: t('groupProject', lang) },
    { key: 'pinned', label: t('groupPinned', lang) },
  ];

  const renderLogCard = (log: LogEntry) => {
    const preview = buildPreview(log);
    const modeLabel = log.outputMode === 'handoff' ? 'Handoff' : 'Log';
    const today = isToday(log.createdAt);
    const isSelected = selected.has(log.id);
    return (
      <div key={log.id} className={`card${isSelected ? ' card-selected' : ''}`} role="button" tabIndex={0} onClick={() => handleCardClick(log.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(log.id); } }} style={{ position: 'relative', display: 'flex', gap: selectMode ? 12 : 0 }}>
        {selectMode && (
          <div style={{ paddingTop: 2, flexShrink: 0 }}>
            <input type="checkbox" className="bulk-checkbox" checked={isSelected} onChange={() => toggleSelect(log.id)} onClick={(e) => e.stopPropagation()} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Three-dot menu — right side, fixed */}
          {!selectMode && (
            <div style={{ position: 'absolute', top: 12, right: 12 }} onClick={(e) => e.stopPropagation()}>
              <button className="action-menu-btn" aria-label={t('ariaMenu', lang)} onClick={() => setActionSheetLog(actionSheetLog?.id === log.id ? null : log)}>
                <MoreHorizontal size={16} />
              </button>
              {actionSheetLog?.id === log.id && (
                <LogContextMenu
                  log={log}
                  lang={lang}
                  projects={projects}
                  onClose={() => setActionSheetLog(null)}
                  onAction={(action, value) => handleLogAction(log, action, value)}
                />
              )}
            </div>
          )}
          {/* Row 1: state (left) + badge + date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {log.pinned && (
              <Pin size={12} style={{ color: 'var(--accent)', flexShrink: 0, transform: 'rotate(45deg)' }} />
            )}
            <span className={log.outputMode === 'handoff' ? 'badge-handoff' : 'badge-worklog'}>{modeLabel}</span>
            <span className="meta" style={{ fontSize: 11, color: today ? 'var(--accent-text)' : undefined, fontWeight: today ? 500 : undefined }}>
              {formatDateFull(log.createdAt)}
            </span>
            {!activeProjectId && log.projectId && (() => {
              const proj = projects.find((p) => p.id === log.projectId);
              return proj ? (
                <span
                  className="tag"
                  style={{ fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                  onClick={(e) => { e.stopPropagation(); onOpenProject?.(proj.id); }}
                >
                  {proj.icon && <span style={{ fontSize: 11 }}>{proj.icon}</span>}
                  {proj.name}
                </span>
              ) : null;
            })()}
          </div>
          {/* Row 2: title */}
          <div className="card-title-clamp" style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.4, paddingRight: 48 }}>
            <Highlight text={log.title} query={debouncedQuery} />
          </div>
          {/* Row 3: preview */}
          {preview && <div className="meta" style={{ marginTop: 5, lineHeight: 1.55, fontSize: 12.5 }}><Highlight text={preview} query={debouncedQuery} /></div>}
          {/* Row 3.5: nextActions progress */}
          {log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 12, color: 'var(--text-placeholder)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ☑ {log.checkedActions?.length || 0}/{log.nextActions.length}
              </span>
              <div style={{ flex: 1, height: 3, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', maxWidth: 80 }}>
                <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${((log.checkedActions?.length || 0) / log.nextActions.length) * 100}%` }} />
              </div>
            </div>
          )}
          {/* Row 4: unassigned — inline project picker */}
          {!activeProjectId && !log.projectId && projects.length > 0 && (
            <div
              style={{ marginTop: 6, position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                style={{ fontSize: 11, color: 'var(--text-placeholder)', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => setInlinePickerLogId(inlinePickerLogId === log.id ? null : log.id)}
              >
                <FolderOpen size={11} />
                <span style={{ borderBottom: '1px dashed var(--border-subtle)' }}>
                  {t('addToProject', lang)}
                </span>
              </button>
              {inlinePickerLogId === log.id && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 4 }}>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className="tag"
                      style={{ cursor: 'pointer', fontSize: 10, padding: '1px 8px', border: '1px solid var(--border-subtle)', background: 'var(--card-bg)' }}
                      onClick={() => {
                        updateLog(log.id, { projectId: p.id });
                        setInlinePickerLogId(null);
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
          {/* Row 5: tags */}
          {log.tags.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {log.tags.slice(0, 5).map((tg, i) => (
                <span
                  key={i}
                  className="tag"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onTagFilter?.(tg); }}
                >
                  <Highlight text={tg} query={debouncedQuery} />
                </span>
              ))}
              {log.tags.length > 5 && <span className="meta" style={{ fontSize: 11, alignSelf: 'center' }}>+{log.tags.length - 5}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLogListItem = (log: LogEntry) => {
    const modeLabel = log.outputMode === 'handoff' ? 'H' : 'W';
    const isSelected = selected.has(log.id);
    return (
      <div
        key={log.id}
        className={`list-row${isSelected ? ' list-row-selected' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick(log.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(log.id); } }}
      >
        {selectMode && (
          <input type="checkbox" className="bulk-checkbox" checked={isSelected} onChange={() => toggleSelect(log.id)} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }} />
        )}
        {log.pinned && <Pin size={10} style={{ color: 'var(--accent)', flexShrink: 0, transform: 'rotate(45deg)' }} />}
        <span className={log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} style={{ flexShrink: 0 }}>
          {modeLabel}
        </span>
        <span className="list-row-title"><Highlight text={log.title} query={debouncedQuery} /></span>
        <span className="meta" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>{formatDateFull(log.createdAt)}</span>
        {!selectMode && (
          <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button className="action-menu-btn" aria-label={t('ariaMenu', lang)} style={{ opacity: 0 }} onClick={() => setActionSheetLog(actionSheetLog?.id === log.id ? null : log)}>
              <MoreHorizontal size={14} />
            </button>
            {actionSheetLog?.id === log.id && (
              <LogContextMenu
                log={log}
                lang={lang}
                projects={projects}
                onClose={() => setActionSheetLog(null)}
                onAction={(action, value) => handleLogAction(log, action, value)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const renderItem = viewMode === 'list' ? renderLogListItem : renderLogCard;

  // Build flat list for grouped view virtualization
  type FlatItem = { type: 'header'; key: string; label: string; count: number } | { type: 'item'; log: LogEntry };
  const flatItems = useMemo((): FlatItem[] => {
    if (groupKey === 'none') return [];
    const items: FlatItem[] = [];
    for (const group of groups) {
      if (group.label) {
        items.push({ type: 'header', key: group.key, label: group.label, count: group.items.length });
      }
      for (const log of group.items) {
        items.push({ type: 'item', log });
      }
    }
    return items;
  }, [groups, groupKey]);

  const virtualData = groupKey === 'none' ? sorted : flatItems;

  const virtualizer = useVirtualizer({
    count: selectMode ? 0 : virtualData.length,
    getScrollElement: useCallback(() => scrollContainerRef.current, []),
    estimateSize: useCallback((index: number) => {
      if (groupKey !== 'none') {
        const item = flatItems[index];
        if (item?.type === 'header') return 44;
        if (viewMode === 'list') return 44;
        if (item?.type === 'item') {
          const log = item.log;
          let h = 120;
          if (log.tags.length > 0) h += 32;
          if (log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0) h += 24;
          if (!activeProjectId && !log.projectId && projects.length > 0) h += 28;
          return h;
        }
      }
      if (viewMode === 'list') return 44;
      // Non-grouped: use sorted array
      const log = sorted[index];
      if (log) {
        let h = 120;
        if (log.tags.length > 0) h += 32;
        if (log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0) h += 24;
        if (!activeProjectId && !log.projectId && projects.length > 0) h += 28;
        return h;
      }
      return 120;
    }, [groupKey, flatItems, viewMode, sorted, activeProjectId, projects.length]),
    overscan: 5,
  });

  return (
    <div className="workspace-content-wide" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header page-header-sticky">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2>
              {t('logs', lang)}
              {activeProjectId && (() => {
                const proj = projects.find((p) => p.id === activeProjectId);
                return proj ? <span className="page-subtitle" style={{ display: 'inline', marginLeft: 8 }}>— {proj.name}</span> : null;
              })()}
            </h2>
            <p className="page-subtitle">{tf('logCount', lang, sorted.length)}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!selectMode && activeProjectId && onOpenMasterNote && (() => {
              const hasNote = !!getMasterNote(activeProjectId);
              return (
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: '4px 12px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => onOpenMasterNote(activeProjectId)}
                >
                  <BookOpen size={12} />
                  {hasNote ? t('projectSummaryOpen', lang) : t('projectSummaryCreate', lang)}
                </button>
              );
            })()}
            {!selectMode && activeProjectId && (
              <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px', minHeight: 26 }} onClick={() => setLogPickerOpen(true)}>
                {t('addLogsToProject', lang)}
              </button>
            )}
            {!selectMode && sorted.length > 0 && (
              <button className="btn" style={{ fontSize: 12, padding: '4px 12px', minHeight: 26 }} onClick={() => setSelectMode(true)}>
                {t('selectMode', lang)}
              </button>
            )}
            {selectMode && (
              <button className="btn" style={{ fontSize: 12, padding: '4px 12px', minHeight: 26 }} onClick={toggleAll}>
                {selected.size === sorted.length ? t('deselectAll', lang) : t('selectAll', lang)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar: filter + search + sort + group */}
      <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="seg-control">
          {(['all', 'pinned', 'worklog', 'handoff'] as const).map((v) => (
            <button
              key={v}
              className={`seg-control-btn${modeFilter === v ? ' active-worklog' : ''}`}
              onClick={() => setModeFilter(v)}
            >
              {v === 'all' ? t('filterAll', lang) : v === 'pinned' ? t('filterPinned', lang) : v === 'worklog' ? t('filterWorklog', lang) : t('filterHandoff', lang)}
            </button>
          ))}
        </div>
        <input
          className="input input-sm"
          type="text"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder={t('searchLogs', lang)}
          maxLength={200}
          style={{ flex: 1, minWidth: 120 }}
        />
        <DropdownMenu
          label={t('sortLabel', lang)}
          value={sortKey}
          options={sortOptions}
          onChange={(k) => setSortKey(k as SortKey)}
        />
        <DropdownMenu
          label={t('groupLabel', lang)}
          value={groupKey}
          options={groupOptions}
          onChange={(k) => setGroupKey(k as GroupKey)}
        />
        <div style={{ position: 'relative' }}>
          <button
            className={`btn btn-sm${dateFrom || dateTo ? ' btn-active' : ''}`}
            onClick={() => setDateFilterOpen(!dateFilterOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', minHeight: 26 }}
          >
            <Calendar size={12} />
            {t('dateFilterBtn', lang)}
            {(dateFrom || dateTo) && <span style={{ marginLeft: 2, fontWeight: 600 }}>·</span>}
          </button>
          {dateFilterOpen && (
            <div className="date-filter-panel" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {(['today', 'week', 'month'] as DatePreset[]).map((p) => (
                  <button
                    key={p}
                    className={`btn btn-sm${datePreset === p ? ' btn-active' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px', minHeight: 22 }}
                    onClick={() => {
                      if (datePreset === p) {
                        setDatePreset(null); setDateFrom(''); setDateTo('');
                      } else {
                        setDatePreset(p);
                        const range = getDateRange(p);
                        setDateFrom(range.from); setDateTo(range.to);
                      }
                    }}
                  >
                    {p === 'today' ? t('dateFilterToday', lang) : p === 'week' ? t('dateFilterThisWeek', lang) : t('dateFilterThisMonth', lang)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <label style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('dateFilterFrom', lang)}</label>
                <input
                  type="date"
                  className="input input-sm"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setDatePreset('custom'); }}
                  style={{ fontSize: 12, padding: '2px 4px', minHeight: 24, width: 130 }}
                />
                <label style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('dateFilterTo', lang)}</label>
                <input
                  type="date"
                  className="input input-sm"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setDatePreset('custom'); }}
                  style={{ fontSize: 12, padding: '2px 4px', minHeight: 24, width: 130 }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, marginTop: 6, padding: '2px 8px', minHeight: 22 }}
                  onClick={() => { setDateFrom(''); setDateTo(''); setDatePreset(null); }}
                >
                  {t('dateFilterClear', lang)}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="seg-control" style={{ marginLeft: 'auto' }}>
          <button
            className={`seg-control-btn${viewMode === 'card' ? ' active-worklog' : ''}`}
            onClick={() => setViewMode('card')}
            title={t('viewCard', lang)}
            aria-label={t('ariaCardView', lang)}
            style={{ padding: '4px 8px' }}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            className={`seg-control-btn${viewMode === 'list' ? ' active-worklog' : ''}`}
            onClick={() => setViewMode('list')}
            title={t('viewList', lang)}
            aria-label={t('ariaListView', lang)}
            style={{ padding: '4px 8px' }}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Tag filter indicator */}
      {tagFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>{t('tagFilter', lang)}:</span>
          <span className="tag" style={{ fontWeight: 600 }}>{tagFilter}</span>
          <button
            className="btn"
            style={{ fontSize: 11, padding: '1px 8px', minHeight: 20, lineHeight: 1 }}
            onClick={onClearTagFilter}
          >
            ×
          </button>
        </div>
      )}

      {/* Top Keywords */}
      {!debouncedQuery.trim() && !tagFilter && modeFilter === 'all' && logs.length >= 3 && (() => {
        if (keywords.length === 0) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={12} />
              {t('topKeywords', lang)}:
            </span>
            {keywords.map((kw) => (
              <span
                key={kw.word}
                className="tag"
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer', fontSize: 12 }}
                onClick={() => setRawQuery(kw.word)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRawQuery(kw.word); } }}
              >
                {kw.word}
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>{kw.count}</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Date filter indicator */}
      {(dateFrom || dateTo) && !dateFilterOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
          <Calendar size={12} />
          <span>{dateFrom || '...'} — {dateTo || '...'}</span>
          <button
            className="btn"
            style={{ fontSize: 11, padding: '1px 8px', minHeight: 20, lineHeight: 1 }}
            onClick={() => { setDateFrom(''); setDateTo(''); setDatePreset(null); }}
          >
            ×
          </button>
        </div>
      )}

      {/* Unassigned logs hint */}
      {!activeProjectId && !selectMode && !debouncedQuery.trim() && modeFilter === 'all' && projects.length > 0 && (() => {
        const unassigned = sorted.filter((l) => !l.projectId).length;
        if (unassigned === 0 || unassigned === sorted.length) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-muted)' }}>
            <FolderOpen size={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
            <span>
              {tf('unassignedLogsHint', lang, unassigned)}
            </span>
            <button
              className="btn"
              style={{ fontSize: 11, padding: '2px 10px', minHeight: 22, whiteSpace: 'nowrap', marginLeft: 'auto' }}
              onClick={() => { setSelectMode(true); setGroupKey('project'); }}
            >
              {t('organizeBtn', lang)}
            </button>
          </div>
        );
      })()}

      {/* Log list */}
      {sorted.length === 0 ? (
        <div className="empty-state">
          {!debouncedQuery.trim() && modeFilter === 'all' && <div className="empty-state-icon">&#128221;</div>}
          <p>{debouncedQuery.trim() || modeFilter !== 'all' ? t('noMatchingLogs', lang) : t('noLogsYet', lang)}</p>
          {!debouncedQuery.trim() && modeFilter === 'all' && !activeProjectId && <p className="page-subtitle">{t('noLogsYetDesc', lang)}</p>}
          {!debouncedQuery.trim() && modeFilter === 'all' && activeProjectId && (
            <>
              <p className="page-subtitle">{t('addLogsEmptyHint', lang)}</p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setLogPickerOpen(true)}>
                {t('addLogsToProject', lang)}
              </button>
            </>
          )}
        </div>
      ) : selectMode ? (
        /* Select mode: render all items without virtualization (needed for bulk selection UX) */
        groupKey === 'none' ? (
          <>{sorted.map(renderItem)}</>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {groups.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, padding: '0 4px' }}>
                    <span
                      style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: groupKey === 'project' && group.key !== '_none' ? 'pointer' : undefined }}
                      onClick={groupKey === 'project' && group.key !== '_none' ? () => onOpenProject?.(group.key) : undefined}
                    >
                      {group.label}
                    </span>
                    <span className="meta" style={{ fontSize: 12 }}>{tf('logCount', lang, group.items.length)}</span>
                  </div>
                )}
                {group.items.map(renderLogCard)}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Normal mode: virtualized rendering */
        <div
          ref={scrollContainerRef}
          style={{ flex: 1, minHeight: 0, overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              if (groupKey !== 'none') {
                const flatItem = flatItems[virtualItem.index];
                if (flatItem.type === 'header') {
                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: 'absolute',
                        top: virtualItem.start,
                        width: '100%',
                        height: virtualItem.size,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, padding: '10px 4px 0' }}>
                        <span
                          style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: groupKey === 'project' && flatItem.key !== '_none' ? 'pointer' : undefined }}
                          onClick={groupKey === 'project' && flatItem.key !== '_none' ? () => onOpenProject?.(flatItem.key) : undefined}
                        >
                          {flatItem.label}
                        </span>
                        <span className="meta" style={{ fontSize: 12 }}>{tf('logCount', lang, flatItem.count)}</span>
                        {groupKey === 'project' && flatItem.key !== '_none' && onOpenMasterNote && (
                          <span
                            style={{ fontSize: 11, color: 'var(--accent-text)', cursor: 'pointer', marginLeft: 'auto' }}
                            onClick={() => onOpenMasterNote(flatItem.key)}
                          >
                            {t('viewSummaryLink', lang)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: virtualItem.start,
                      width: '100%',
                    }}
                  >
                    {renderLogCard(flatItem.log)}
                  </div>
                );
              }
              const log = sorted[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: virtualItem.start,
                    width: '100%',
                  }}
                >
                  {renderItem(log)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log Picker Modal */}
      {logPickerOpen && activeProjectId && (
        <LogPickerModal
          allLogs={loadLogs()}
          targetProjectId={activeProjectId}
          projects={projects}
          lang={lang}
          onConfirm={(logIds) => {
            for (const id of logIds) updateLog(id, { projectId: activeProjectId });
            setLogPickerOpen(false);
            onRefresh();
            showToast?.(tf('bulkAddedToast', lang, logIds.length), 'success');
          }}
          onClose={() => setLogPickerOpen(false)}
        />
      )}
      {confirmTrashLog && (
        <ConfirmDialog
          title={t('deleteConfirm', lang)}
          description={t('deleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { trashLog(confirmTrashLog.id); setConfirmTrashLog(null); onRefresh(); }}
          onCancel={() => setConfirmTrashLog(null)}
        />
      )}

      {/* Floating bulk action bar (bottom) */}
      {selectMode && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-default)',
          padding: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          zIndex: 100,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, marginRight: 'auto' }}>
            {selected.size > 0 ? tf('selectedCount', lang, selected.size) : t('selectItems', lang)}
          </span>
          {selected.size > 0 && (
            <>
              <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }} onClick={handleBulkDelete}>
                <Trash2 size={13} />
                {t('bulkTrash', lang)}
              </button>
              {projects.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setProjectPickerOpen(!projectPickerOpen)}>
                    <FolderOpen size={13} />
                    {t('bulkAssignProject', lang)}
                  </button>
                  {projectPickerOpen && (
                    <div className="card-menu-dropdown" style={{ right: 'auto', left: 0, bottom: '100%', top: 'auto' }} onClick={(e) => e.stopPropagation()}>
                      {projects.map((p) => (
                        <button key={p.id} className="card-menu-item" onClick={() => handleBulkAssignProject(p.id)}>{p.name}</button>
                      ))}
                      <button className="card-menu-item" style={{ color: 'var(--text-placeholder)' }} onClick={() => handleBulkAssignProject('')}>
                        {t('removeFromProject', lang)}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <button className="btn" style={{ fontSize: 12, padding: '4px 10px', minHeight: 26 }} onClick={exitSelectMode}>
            {t('cancel', lang)}
          </button>
        </div>
      )}
    </div>
  );
}
