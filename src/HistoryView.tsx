import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePersistedState } from './usePersistedState';
import { FolderOpen, BookOpen, Trash2, Calendar } from 'lucide-react';
import type { LogEntry, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { trashLog, updateLog, loadLogs, getMasterNote, duplicateLog } from './storage';
import { logToMarkdown } from './markdown';
import { EmptyLogs } from './EmptyIllustrations';
import LogPickerModal from './LogPickerModal';
import ConfirmDialog from './ConfirmDialog';
import { matchesLogQuery } from './search';
import { formatDateGroup } from './utils/dateFormat';

// Extracted components
import { HistoryCardItem, HistoryListItem, downloadFile, type LogRenderContext } from './components/HistoryCard';
import {
  HistoryFiltersToolbar, KeywordsBar, matchesDateRange,
  type ModeFilter, type SortKey, type GroupKey, type DatePreset,
} from './components/HistoryFilters';

// ─── Main HistoryView ───
interface HistoryViewProps {
  logs: LogEntry[];
  onSelect: (id: string) => void;
  onBack: () => void;
  showBack?: boolean;
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

function HistoryView({ logs, onSelect, onBack, showBack = true, onRefresh, lang, activeProjectId, projects, showToast, onOpenMasterNote, onOpenProject, tagFilter, onClearTagFilter, onTagFilter, onDuplicate }: HistoryViewProps) {
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [modeFilter, setModeFilter] = usePersistedState<ModeFilter>('threadlog_logs_filter', 'all');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('threadlog_logs_sort', 'created');
  const [groupKey, setGroupKey] = usePersistedState<GroupKey>('threadlog_logs_group', 'none');
  const [viewMode, setViewMode] = usePersistedState<'card' | 'list'>('threadlog_logs_viewmode', 'card');
  const [viewDensity, setViewDensity] = usePersistedState<'comfortable' | 'compact'>('threadlog_view_density', 'comfortable');
  const compact = viewDensity === 'compact';
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [logPickerOpen, setLogPickerOpen] = useState(false);
  const [actionSheetLog, setActionSheetLog] = useState<LogEntry | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
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

  // Filter (memoised)
  const filtered = useMemo(() => logs.filter((log) => {
    if (modeFilter === 'pinned' && !log.pinned) return false;
    if (modeFilter !== 'all' && modeFilter !== 'pinned' && (log.outputMode ?? 'worklog') !== modeFilter) return false;
    if (debouncedQuery.trim() && !matchesLogQuery(log, debouncedQuery.trim())) return false;
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

  const groups = useMemo((): GroupedEntry[] => {
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

    if (groupKey === 'pinned') {
      return ['pinned', 'unpinned']
        .filter((k) => map.has(k))
        .map((k) => ({ key: k, ...map.get(k)! }));
    }

    return order.map((k) => ({ key: k, ...map.get(k)! }));
  }, [sorted, groupKey, lang, projects]);

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
        setEditingLogId(log.id);
        setEditDraft(log.title);
        setActionSheetLog(null);
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

  // Shared render context for card/list items
  const renderCtx: LogRenderContext = {
    lang, projects, activeProjectId, compact, selectMode, selected, debouncedQuery,
    editingLogId, editDraft, actionSheetLog, inlinePickerLogId,
    onCardClick: handleCardClick,
    onToggleSelect: toggleSelect,
    onSetActionSheetLog: setActionSheetLog,
    onLogAction: handleLogAction,
    onSetEditDraft: setEditDraft,
    onSetEditingLogId: setEditingLogId,
    onSetInlinePickerLogId: setInlinePickerLogId,
    onRefresh, onOpenProject, onTagFilter, showToast,
  };

  const renderLogCard = (log: LogEntry) => <HistoryCardItem key={log.id} log={log} ctx={renderCtx} />;
  const renderLogListItem = (log: LogEntry) => <HistoryListItem key={log.id} log={log} ctx={renderCtx} />;
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

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: selectMode ? 0 : virtualData.length,
    getScrollElement: useCallback(() => scrollContainerRef.current, []),
    estimateSize: useCallback((index: number) => {
      const listH = compact ? 30 : 44;
      const baseH = compact ? 80 : 120;
      const tagH = compact ? 20 : 32;
      const actionH = compact ? 18 : 24;
      const projectH = compact ? 20 : 28;
      if (groupKey !== 'none') {
        const item = flatItems[index];
        if (item?.type === 'header') return 44;
        if (viewMode === 'list') return listH;
        if (item?.type === 'item') {
          const log = item.log;
          let h = baseH;
          if (log.tags.length > 0) h += tagH;
          if (log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0) h += actionH;
          if (!activeProjectId && !log.projectId && projects.length > 0) h += projectH;
          return h;
        }
      }
      if (viewMode === 'list') return listH;
      const log = sorted[index];
      if (log) {
        let h = baseH;
        if (log.tags.length > 0) h += tagH;
        if (log.outputMode === 'handoff' && log.nextActions && log.nextActions.length > 0) h += actionH;
        if (!activeProjectId && !log.projectId && projects.length > 0) h += projectH;
        return h;
      }
      return baseH;
    }, [groupKey, flatItems, viewMode, sorted, activeProjectId, projects.length, compact]),
    overscan: 5,
  });

  return (
    <div className="workspace-content-wide flex-col h-full">
      <div className="page-header page-header-sticky">
        {showBack && (
          <button className="btn-back mb-md" onClick={onBack}>
            ← {t('back', lang)}
          </button>
        )}
        <div className="page-header-row">
          <div>
            <h2>
              {t('logs', lang)}
              {activeProjectId && (() => {
                const proj = projects.find((p) => p.id === activeProjectId);
                return proj ? <span className="page-subtitle" style={{ display: 'inline', marginLeft: 8 }}>&#8212; {proj.name}</span> : null;
              })()}
            </h2>
            <p className="page-subtitle">{tf('logCount', lang, sorted.length)}</p>
          </div>
          <div className="flex gap-6">
            {!selectMode && activeProjectId && onOpenMasterNote && (() => {
              const hasNote = !!getMasterNote(activeProjectId);
              return (
                <button
                  className="btn flex-row btn-sm-compact gap-xs"
                  onClick={() => onOpenMasterNote(activeProjectId)}
                >
                  <BookOpen size={12} />
                  {hasNote ? t('projectSummaryOpen', lang) : t('projectSummaryCreate', lang)}
                </button>
              );
            })()}
            {!selectMode && activeProjectId && (
              <button className="btn btn-primary btn-sm-compact" onClick={() => setLogPickerOpen(true)}>
                {t('addLogsToProject', lang)}
              </button>
            )}
            {!selectMode && sorted.length > 0 && (
              <button className="btn btn-sm-compact" onClick={() => setSelectMode(true)}>
                {t('selectMode', lang)}
              </button>
            )}
            {selectMode && (
              <button className="btn btn-sm-compact" onClick={toggleAll}>
                {selected.size === sorted.length ? t('deselectAll', lang) : t('selectAll', lang)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar: filter + search + sort + group */}
      <HistoryFiltersToolbar
        lang={lang}
        modeFilter={modeFilter}
        onModeFilterChange={setModeFilter}
        rawQuery={rawQuery}
        onRawQueryChange={setRawQuery}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        groupKey={groupKey}
        onGroupKeyChange={setGroupKey}
        compact={compact}
        onToggleDensity={() => setViewDensity(compact ? 'comfortable' : 'compact')}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dateFilterOpen={dateFilterOpen}
        onDateFilterOpenChange={setDateFilterOpen}
        dateFrom={dateFrom}
        dateTo={dateTo}
        datePreset={datePreset}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onDatePresetChange={setDatePreset}
      />

      {/* Tag filter indicator */}
      {tagFilter && (
        <div className="flex-row mb-md filter-indicator">
          <span>{t('tagFilter', lang)}:</span>
          <span className="tag font-semibold">{tagFilter}</span>
          <button
            className="btn btn-xs-dismiss"
            onClick={onClearTagFilter}
          >
            ×
          </button>
        </div>
      )}

      {/* Top Keywords */}
      <KeywordsBar
        logs={logs}
        lang={lang}
        debouncedQuery={debouncedQuery}
        tagFilter={tagFilter}
        modeFilter={modeFilter}
        onSetQuery={setRawQuery}
      />

      {/* Date filter indicator */}
      {(dateFrom || dateTo) && !dateFilterOpen && (
        <div className="flex-row mb-md filter-indicator">
          <Calendar size={12} />
          <span>{dateFrom || '...'} &#8212; {dateTo || '...'}</span>
          <button
            className="btn btn-xs-dismiss"
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
          <div className="flex-row text-sm-muted hint-card">
            <FolderOpen size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
            <span>
              {tf('unassignedLogsHint', lang, unassigned)}
            </span>
            <button
              className="btn btn-xs-dismiss ml-auto"
              style={{ padding: '2px 10px', minHeight: 22, whiteSpace: 'nowrap' }}
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
          {!debouncedQuery.trim() && modeFilter === 'all' && <EmptyLogs lang={lang} />}
          <p>{debouncedQuery.trim() || modeFilter !== 'all' ? t('noMatchingLogs', lang) : t('noLogsYet', lang)}</p>
          {!debouncedQuery.trim() && modeFilter === 'all' && !activeProjectId && <p className="page-subtitle">{t('noLogsYetDesc', lang)}</p>}
          {!debouncedQuery.trim() && modeFilter === 'all' && !activeProjectId && (
            <button className="btn btn-primary mt-md" onClick={onBack}>
              {t('createFirstLog', lang)}
            </button>
          )}
          {!debouncedQuery.trim() && modeFilter === 'all' && activeProjectId && (
            <>
              <p className="page-subtitle">{t('addLogsEmptyHint', lang)}</p>
              <button className="btn btn-primary mt-md" onClick={() => setLogPickerOpen(true)}>
                {t('addLogsToProject', lang)}
              </button>
            </>
          )}
        </div>
      ) : selectMode ? (
        groupKey === 'none' ? (
          <div role="list">{sorted.map((log) => <div key={log.id} role="listitem">{renderItem(log)}</div>)}</div>
        ) : (
          <div className="flex-col gap-24">
            {groups.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <div className="history-group-header">
                    {groupKey === 'project' && group.key !== '_none' ? (
                      <button
                        type="button"
                        className="history-group-label history-group-label-btn"
                        onClick={() => onOpenProject?.(group.key)}
                      >
                        {group.label}
                      </button>
                    ) : (
                      <span className="history-group-label">{group.label}</span>
                    )}
                    <span className="meta text-sm">{tf('logCount', lang, group.items.length)}</span>
                  </div>
                )}
                <div role="list">
                  {group.items.map((log) => <div key={log.id} role="listitem">{renderLogCard(log)}</div>)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div
          ref={scrollContainerRef}
          className="history-scroll-container"
        >
          <div role="list" className="virtual-list-container" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              if (groupKey !== 'none') {
                const flatItem = flatItems[virtualItem.index];
                if (flatItem.type === 'header') {
                  return (
                    <div
                      key={virtualItem.key}
                      role="presentation"
                      style={{
                        position: 'absolute',
                        top: virtualItem.start,
                        width: '100%',
                        height: virtualItem.size,
                      }}
                    >
                      <div className="history-group-header-virtual">
                        {groupKey === 'project' && flatItem.key !== '_none' ? (
                          <button
                            type="button"
                            className="history-group-label history-group-label-btn"
                            onClick={() => onOpenProject?.(flatItem.key)}
                          >
                            {flatItem.label}
                          </button>
                        ) : (
                          <span className="history-group-label">{flatItem.label}</span>
                        )}
                        <span className="meta text-sm">{tf('logCount', lang, flatItem.count)}</span>
                        {groupKey === 'project' && flatItem.key !== '_none' && onOpenMasterNote && (
                          <button
                            type="button"
                            className="summary-link"
                            onClick={() => onOpenMasterNote(flatItem.key)}
                          >
                            {t('viewSummaryLink', lang)}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={virtualItem.key}
                    role="listitem"
                    className="virtual-item"
                    style={{ top: virtualItem.start }}
                  >
                    {renderLogCard(flatItem.log)}
                  </div>
                );
              }
              const log = sorted[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  role="listitem"
                  className="virtual-item"
                  style={{ top: virtualItem.start }}
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
        <div className="flex-row bulk-bar">
          <span className="bulk-bar-label">
            {selected.size > 0 ? tf('selectedCount', lang, selected.size) : t('selectItems', lang)}
          </span>
          {selected.size > 0 && (
            <>
              <button className="btn btn-danger flex-row btn-sm-compact gap-xs" onClick={handleBulkDelete}>
                <Trash2 size={13} />
                {t('bulkTrash', lang)}
              </button>
              {projects.length > 0 && (
                <div className="relative">
                  <button className="btn flex-row btn-sm-compact gap-xs" onClick={() => setProjectPickerOpen(!projectPickerOpen)}>
                    <FolderOpen size={13} />
                    {t('bulkAssignProject', lang)}
                  </button>
                  {projectPickerOpen && (
                    <div className="card-menu-dropdown" style={{ right: 'auto', left: 0, bottom: '100%', top: 'auto' }} onClick={(e) => e.stopPropagation()}>
                      {projects.map((p) => (
                        <button key={p.id} className="card-menu-item" onClick={() => handleBulkAssignProject(p.id)}>{p.name}</button>
                      ))}
                      <button className="card-menu-item text-placeholder" onClick={() => handleBulkAssignProject('')}>
                        {t('removeFromProject', lang)}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <button className="btn btn-sm-compact" onClick={exitSelectMode}>
            {t('cancel', lang)}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(HistoryView);
