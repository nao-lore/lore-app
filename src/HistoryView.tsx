import { useState, useEffect, useMemo, memo } from 'react';
import { usePersistedState } from './usePersistedState';
import { Calendar } from 'lucide-react';
import type { LogEntry, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { trashLog, updateLog, loadLogs, getMasterNote, duplicateLog } from './storage';
import { logToMarkdown } from './markdown';
import LogPickerModal from './LogPickerModal';
import ConfirmDialog from './ConfirmDialog';
import { matchesLogQuery } from './search';
import { formatDateGroup } from './utils/dateFormat';

// Extracted components
import { type LogRenderContext } from './components/HistoryCard';
import { downloadFile } from './components/historyCardHelpers';
import { HistoryFiltersToolbar, KeywordsBar } from './components/HistoryFilters';
import { matchesDateRange, type ModeFilter, type SortKey, type GroupKey, type DatePreset } from './components/historyFiltersHelpers';
import { HistoryPageHeader, HistoryBulkBar } from './components/HistoryGroupHeader';
import { HistoryEmptyState, UnassignedLogsHint, HistorySelectModeList, HistoryVirtualList } from './components/HistoryListView';

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
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setDateFilterOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKeyDown); };
  }, [dateFilterOpen]);

  const filtered = useMemo(() => logs.filter((log) => {
    if (modeFilter === 'pinned' && !log.pinned) return false;
    if (modeFilter !== 'all' && modeFilter !== 'pinned' && (log.outputMode ?? 'worklog') !== modeFilter) return false;
    if (debouncedQuery.trim() && !matchesLogQuery(log, debouncedQuery.trim())) return false;
    if (tagFilter && !log.tags.includes(tagFilter)) return false;
    if ((dateFrom || dateTo) && !matchesDateRange(log, dateFrom, dateTo)) return false;
    return true;
  }), [logs, modeFilter, debouncedQuery, tagFilter, dateFrom, dateTo]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    switch (sortKey) {
      case 'title': return a.title.localeCompare(b.title);
      case 'type': {
        const ta = a.outputMode ?? 'worklog';
        const tb = b.outputMode ?? 'worklog';
        return ta.localeCompare(tb) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'created':
      default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  }), [filtered, sortKey]);

  type GroupedEntry = { key: string; label: string; items: LogEntry[] };

  const groups = useMemo((): GroupedEntry[] => {
    if (groupKey === 'none') return [{ key: '_all', label: '', items: sorted }];
    const map = new Map<string, { label: string; items: LogEntry[] }>();
    const order: string[] = [];
    for (const log of sorted) {
      let key: string; let label: string;
      switch (groupKey) {
        case 'date': { key = new Date(log.createdAt).toISOString().slice(0, 10); label = formatDateGroup(log.createdAt); break; }
        case 'type': { key = log.outputMode ?? 'worklog'; label = key === 'handoff' ? t('filterHandoff', lang) : t('filterWorklog', lang); break; }
        case 'project': { key = log.projectId || '_none'; label = log.projectId ? (projects.find((p) => p.id === log.projectId)?.name || log.projectId) : t('groupNoProject', lang); break; }
        case 'pinned': { key = log.pinned ? 'pinned' : 'unpinned'; label = log.pinned ? t('groupPinnedLabel', lang) : t('groupUnpinnedLabel', lang); break; }
        default: key = '_all'; label = '';
      }
      if (!map.has(key)) { map.set(key, { label, items: [] }); order.push(key); }
      map.get(key)!.items.push(log);
    }
    if (groupKey === 'pinned') return ['pinned', 'unpinned'].filter((k) => map.has(k)).map((k) => ({ key: k, ...map.get(k)! }));
    return order.map((k) => ({ key: k, ...map.get(k)! }));
  }, [sorted, groupKey, lang, projects]);

  type FlatItem = { type: 'header'; key: string; label: string; count: number } | { type: 'item'; log: LogEntry };
  const flatItems = useMemo((): FlatItem[] => {
    if (groupKey === 'none') return [];
    const items: FlatItem[] = [];
    for (const group of groups) {
      if (group.label) items.push({ type: 'header', key: group.key, label: group.label, count: group.items.length });
      for (const log of group.items) items.push({ type: 'item', log });
    }
    return items;
  }, [groups, groupKey]);

  const handleLogAction = (log: LogEntry, action: string, value?: string) => {
    switch (action) {
      case 'pin':
        if (!log.pinned && logs.filter((l) => l.pinned).length >= 5) { showToast?.(t('pinLimitReached', lang), 'error'); break; }
        updateLog(log.id, { pinned: !log.pinned }); onRefresh(); break;
      case 'rename': setEditingLogId(log.id); setEditDraft(log.title); setActionSheetLog(null); break;
      case 'assignProject': if (value) { updateLog(log.id, { projectId: value }); onRefresh(); } break;
      case 'removeProject': updateLog(log.id, { projectId: undefined }); onRefresh(); break;
      case 'copyMd': navigator.clipboard.writeText(logToMarkdown(log)).then(() => showToast?.(t('logCopied', lang), 'success'), () => showToast?.(t('copyFailed', lang), 'error')); break;
      case 'downloadMd': { const date = new Date(log.createdAt).toISOString().slice(0, 10); const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog'; downloadFile(logToMarkdown(log), `threadlog-${date}-${type}.md`, 'text/markdown'); break; }
      case 'downloadJson': { const d2 = new Date(log.createdAt).toISOString().slice(0, 10); const t2 = log.outputMode === 'handoff' ? 'handoff' : 'worklog'; const { sourceText: _s, ...exportData } = log; void _s; downloadFile(JSON.stringify(exportData, null, 2), `threadlog-${d2}-${t2}.json`, 'application/json'); break; }
      case 'duplicate': { const suffix = t('duplicateLogSuffix', lang); const newId = duplicateLog(log.id, suffix); if (newId) { onRefresh(); showToast?.(t('duplicateLogDone', lang), 'success'); onDuplicate?.(newId); } break; }
      case 'delete': setConfirmTrashLog(log); break;
    }
  };

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };
  const toggleSelect = (id: string) => { setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleAll = () => { if (selected.size === sorted.length) setSelected(new Set()); else setSelected(new Set(sorted.map((l) => l.id))); };
  const handleBulkDelete = () => { const count = selected.size; if (!window.confirm(tf('bulkTrashConfirm', lang, count))) return; for (const id of selected) trashLog(id); exitSelectMode(); onRefresh(); showToast?.(tf('bulkDeletedToast', lang, count), 'success'); };
  const handleBulkAssignProject = (projectId: string) => { const count = selected.size; for (const id of selected) updateLog(id, { projectId: projectId || undefined }); setProjectPickerOpen(false); exitSelectMode(); onRefresh(); if (projectId && showToast) { const project = projects.find((p) => p.id === projectId); showToast(tf('bulkAssignedToast', lang, count, project?.name || ''), 'success'); } };

  const handleCardClick = (id: string) => { if (selectMode) toggleSelect(id); else onSelect(id); };

  const renderCtx: LogRenderContext = {
    lang, projects, activeProjectId, compact, selectMode, selected, debouncedQuery,
    editingLogId, editDraft, actionSheetLog, inlinePickerLogId,
    onCardClick: handleCardClick, onToggleSelect: toggleSelect, onSetActionSheetLog: setActionSheetLog,
    onLogAction: handleLogAction, onSetEditDraft: setEditDraft, onSetEditingLogId: setEditingLogId,
    onSetInlinePickerLogId: setInlinePickerLogId, onRefresh, onOpenProject, onTagFilter, showToast,
  };

  const hasMasterNote = !!(activeProjectId && getMasterNote(activeProjectId));

  return (
    <div className="workspace-content-wide flex-col">
      <HistoryPageHeader
        lang={lang} sortedCount={sorted.length} activeProjectId={activeProjectId}
        projects={projects} selectMode={selectMode} selectedCount={selected.size}
        showBack={showBack} hasMasterNote={hasMasterNote} onBack={onBack}
        onToggleAll={toggleAll} onStartSelect={() => setSelectMode(true)}
        onOpenLogPicker={() => setLogPickerOpen(true)} onOpenMasterNote={onOpenMasterNote}
      />

      <HistoryFiltersToolbar
        lang={lang} modeFilter={modeFilter} onModeFilterChange={setModeFilter}
        rawQuery={rawQuery} onRawQueryChange={setRawQuery} sortKey={sortKey} onSortKeyChange={setSortKey}
        groupKey={groupKey} onGroupKeyChange={setGroupKey} compact={compact}
        onToggleDensity={() => setViewDensity(compact ? 'comfortable' : 'compact')}
        viewMode={viewMode} onViewModeChange={setViewMode} dateFilterOpen={dateFilterOpen}
        onDateFilterOpenChange={setDateFilterOpen} dateFrom={dateFrom} dateTo={dateTo}
        datePreset={datePreset} onDateFromChange={setDateFrom} onDateToChange={setDateTo}
        onDatePresetChange={setDatePreset}
      />

      {tagFilter && (
        <div className="flex-row mb-md filter-indicator">
          <span>{t('tagFilter', lang)}:</span>
          <span className="tag font-semibold">{tagFilter}</span>
          <button className="btn btn-xs-dismiss" onClick={onClearTagFilter}>×</button>
        </div>
      )}

      <KeywordsBar logs={logs} lang={lang} debouncedQuery={debouncedQuery} tagFilter={tagFilter} modeFilter={modeFilter} onSetQuery={setRawQuery} />

      {(dateFrom || dateTo) && !dateFilterOpen && (
        <div className="flex-row mb-md filter-indicator">
          <Calendar size={12} />
          <span>{dateFrom || '...'} &#8212; {dateTo || '...'}</span>
          <button className="btn btn-xs-dismiss" onClick={() => { setDateFrom(''); setDateTo(''); setDatePreset(null); }}>×</button>
        </div>
      )}

      {!activeProjectId && !selectMode && !debouncedQuery.trim() && modeFilter === 'all' && projects.length > 0 && (
        <UnassignedLogsHint lang={lang} sorted={sorted} onStartOrganize={() => { setSelectMode(true); setGroupKey('project'); }} />
      )}

      {sorted.length === 0 ? (
        <HistoryEmptyState lang={lang} debouncedQuery={debouncedQuery} modeFilter={modeFilter} activeProjectId={activeProjectId} onBack={onBack} onOpenLogPicker={() => setLogPickerOpen(true)} />
      ) : selectMode ? (
        <HistorySelectModeList sorted={sorted} groups={groups} groupKey={groupKey} viewMode={viewMode} renderCtx={renderCtx} lang={lang} onOpenProject={onOpenProject} />
      ) : (
        <HistoryVirtualList
          sorted={sorted} groups={groups} flatItems={flatItems} groupKey={groupKey}
          viewMode={viewMode} compact={compact} activeProjectId={activeProjectId}
          projects={projects} renderCtx={renderCtx} lang={lang}
          onOpenProject={onOpenProject} onOpenMasterNote={onOpenMasterNote}
        />
      )}

      {logPickerOpen && activeProjectId && (
        <LogPickerModal
          allLogs={loadLogs()} targetProjectId={activeProjectId} projects={projects} lang={lang}
          onConfirm={(logIds) => { for (const id of logIds) updateLog(id, { projectId: activeProjectId }); setLogPickerOpen(false); onRefresh(); showToast?.(tf('bulkAddedToast', lang, logIds.length), 'success'); }}
          onClose={() => setLogPickerOpen(false)}
        />
      )}
      {confirmTrashLog && (
        <ConfirmDialog title={t('deleteConfirm', lang)} description={t('deleteConfirmDesc', lang)} confirmLabel={t('confirmDeleteBtn', lang)} cancelLabel={t('cancel', lang)} onConfirm={() => { trashLog(confirmTrashLog.id); setConfirmTrashLog(null); onRefresh(); }} onCancel={() => setConfirmTrashLog(null)} />
      )}

      {selectMode && (
        <HistoryBulkBar lang={lang} selected={selected} projects={projects} projectPickerOpen={projectPickerOpen} onSetProjectPickerOpen={setProjectPickerOpen} onBulkDelete={handleBulkDelete} onBulkAssignProject={handleBulkAssignProject} onExitSelectMode={exitSelectMode} />
      )}
    </div>
  );
}

export default memo(HistoryView);
