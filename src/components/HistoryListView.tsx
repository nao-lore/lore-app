import { useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderOpen } from 'lucide-react';
import type { LogEntry, Project } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { EmptyLogs } from '../EmptyIllustrations';
import { HistoryCardItem, HistoryListItem, type LogRenderContext } from './HistoryCard';

// ─── Types ───
type GroupedEntry = { key: string; label: string; items: LogEntry[] };
type FlatItem = { type: 'header'; key: string; label: string; count: number } | { type: 'item'; log: LogEntry };

// ─── Empty state ───

interface HistoryEmptyStateProps {
  lang: Lang;
  debouncedQuery: string;
  modeFilter: string;
  activeProjectId: string | null;
  onBack: () => void;
  onOpenLogPicker: () => void;
}

export const HistoryEmptyState = memo(function HistoryEmptyState({
  lang, debouncedQuery, modeFilter, activeProjectId, onBack, onOpenLogPicker,
}: HistoryEmptyStateProps) {
  return (
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
          <button className="btn btn-primary mt-md" onClick={onOpenLogPicker}>
            {t('addLogsToProject', lang)}
          </button>
        </>
      )}
    </div>
  );
});

// ─── Unassigned logs hint ───

interface UnassignedLogsHintProps {
  lang: Lang;
  sorted: LogEntry[];
  onStartOrganize: () => void;
}

export const UnassignedLogsHint = memo(function UnassignedLogsHint({
  lang, sorted, onStartOrganize,
}: UnassignedLogsHintProps) {
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
        onClick={onStartOrganize}
      >
        {t('organizeBtn', lang)}
      </button>
    </div>
  );
});

// ─── Select mode list (non-virtualized) ───

interface HistorySelectModeListProps {
  sorted: LogEntry[];
  groups: GroupedEntry[];
  groupKey: string;
  viewMode: 'card' | 'list';
  renderCtx: LogRenderContext;
  lang: Lang;
  onOpenProject?: (projectId: string) => void;
}

export const HistorySelectModeList = memo(function HistorySelectModeList({
  sorted, groups, groupKey, viewMode, renderCtx, lang, onOpenProject,
}: HistorySelectModeListProps) {
  const renderLogCard = (log: LogEntry) => <HistoryCardItem key={log.id} log={log} ctx={renderCtx} />;
  const renderLogListItem = (log: LogEntry) => <HistoryListItem key={log.id} log={log} ctx={renderCtx} />;
  const renderItem = viewMode === 'list' ? renderLogListItem : renderLogCard;

  if (groupKey === 'none') {
    return <div role="list">{sorted.map((log) => <div key={log.id} role="listitem">{renderItem(log)}</div>)}</div>;
  }

  return (
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
  );
});

// ─── Virtualized list ───

interface HistoryVirtualListProps {
  sorted: LogEntry[];
  groups: GroupedEntry[];
  flatItems: FlatItem[];
  groupKey: string;
  viewMode: 'card' | 'list';
  compact: boolean;
  activeProjectId: string | null;
  projects: Project[];
  renderCtx: LogRenderContext;
  lang: Lang;
  onOpenProject?: (projectId: string) => void;
  onOpenMasterNote?: (projectId: string) => void;
}

export const HistoryVirtualList = memo(function HistoryVirtualList({
  sorted, flatItems, groupKey, viewMode, compact,
  activeProjectId, projects, renderCtx, lang,
  onOpenProject, onOpenMasterNote,
}: HistoryVirtualListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const renderLogCard = (log: LogEntry) => <HistoryCardItem key={log.id} log={log} ctx={renderCtx} />;
  const renderLogListItem = (log: LogEntry) => <HistoryListItem key={log.id} log={log} ctx={renderCtx} />;
  const renderItem = viewMode === 'list' ? renderLogListItem : renderLogCard;

  const virtualData = groupKey === 'none' ? sorted : flatItems;

  const virtualizer = useVirtualizer({
    count: virtualData.length,
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
  );
});
