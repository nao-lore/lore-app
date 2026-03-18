import { useMemo, memo } from 'react';
import { Calendar, TrendingUp, LayoutGrid, List, AlignJustify } from 'lucide-react';
import type { LogEntry } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import DropdownMenu from '../DropdownMenu';
import { extractKeywords, getDateRange } from './historyFiltersHelpers';
import type { DatePreset, ModeFilter, SortKey, GroupKey } from './historyFiltersHelpers';

// ─── Toolbar component ───
interface HistoryFiltersProps {
  lang: Lang;
  modeFilter: ModeFilter;
  onModeFilterChange: (v: ModeFilter) => void;
  rawQuery: string;
  onRawQueryChange: (v: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (v: SortKey) => void;
  groupKey: GroupKey;
  onGroupKeyChange: (v: GroupKey) => void;
  compact: boolean;
  onToggleDensity: () => void;
  viewMode: 'card' | 'list';
  onViewModeChange: (v: 'card' | 'list') => void;
  dateFilterOpen: boolean;
  onDateFilterOpenChange: (v: boolean) => void;
  dateFrom: string;
  dateTo: string;
  datePreset: DatePreset | null;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onDatePresetChange: (v: DatePreset | null) => void;
}

export const HistoryFiltersToolbar = memo(function HistoryFiltersToolbar({
  lang, modeFilter, onModeFilterChange, rawQuery, onRawQueryChange,
  sortKey, onSortKeyChange, groupKey, onGroupKeyChange,
  compact, onToggleDensity, viewMode, onViewModeChange,
  dateFilterOpen, onDateFilterOpenChange, dateFrom, dateTo, datePreset,
  onDateFromChange, onDateToChange, onDatePresetChange,
}: HistoryFiltersProps) {
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

  return (
    <div className="content-card flex-row flex-wrap mb-xl gap-10">
      <div className="seg-control">
        {(['all', 'pinned', 'worklog', 'handoff'] as const).map((v) => (
          <button
            key={v}
            className={`seg-control-btn${modeFilter === v ? ' active-worklog' : ''}`}
            onClick={() => onModeFilterChange(v)}
          >
            {v === 'all' ? t('filterAll', lang) : v === 'pinned' ? t('filterPinned', lang) : v === 'worklog' ? t('filterWorklog', lang) : t('filterHandoff', lang)}
          </button>
        ))}
      </div>
      <input
        className="input input-sm flex-1 min-w-120"
        type="text"
        value={rawQuery}
        onChange={(e) => onRawQueryChange(e.target.value)}
        aria-label={t('ariaSearchLogs', lang)}
        placeholder={t('searchLogs', lang)}
        maxLength={200}
      />
      <DropdownMenu
        label={t('sortLabel', lang)}
        value={sortKey}
        options={sortOptions}
        onChange={(k) => onSortKeyChange(k as SortKey)}
      />
      <DropdownMenu
        label={t('groupLabel', lang)}
        value={groupKey}
        options={groupOptions}
        onChange={(k) => onGroupKeyChange(k as GroupKey)}
      />
      <div className="relative">
        <button
          className={`btn btn-sm flex-row btn-toolbar${dateFrom || dateTo ? ' btn-active' : ''}`}
          onClick={() => onDateFilterOpenChange(!dateFilterOpen)}
        >
          <Calendar size={12} />
          {t('dateFilterBtn', lang)}
          {(dateFrom || dateTo) && <span className="font-semibold" style={{ marginLeft: 2 }}>·</span>}
        </button>
        {dateFilterOpen && (
          <div className="date-filter-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-xs mb-sm">
              {(['today', 'week', 'month'] as DatePreset[]).map((p) => (
                <button
                  key={p}
                  className={`btn btn-sm date-preset-btn${datePreset === p ? ' btn-active' : ''}`}
                  onClick={() => {
                    if (datePreset === p) {
                      onDatePresetChange(null); onDateFromChange(''); onDateToChange('');
                    } else {
                      onDatePresetChange(p);
                      const range = getDateRange(p);
                      onDateFromChange(range.from); onDateToChange(range.to);
                    }
                  }}
                >
                  {p === 'today' ? t('dateFilterToday', lang) : p === 'week' ? t('dateFilterThisWeek', lang) : t('dateFilterThisMonth', lang)}
                </button>
              ))}
            </div>
            <div className="flex-row text-sm gap-6">
              <label className="date-label">{t('dateFilterFrom', lang)}</label>
              <input
                type="date"
                className="input input-sm date-input-sm"
                value={dateFrom}
                aria-label={t('ariaDateFrom', lang)}
                onChange={(e) => { onDateFromChange(e.target.value); onDatePresetChange('custom'); }}
              />
              <label className="date-label">{t('dateFilterTo', lang)}</label>
              <input
                type="date"
                className="input input-sm date-input-sm"
                value={dateTo}
                aria-label={t('ariaDateTo', lang)}
                onChange={(e) => { onDateToChange(e.target.value); onDatePresetChange('custom'); }}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                className="btn btn-sm date-preset-btn mt-sm"
                onClick={() => { onDateFromChange(''); onDateToChange(''); onDatePresetChange(null); }}
              >
                {t('dateFilterClear', lang)}
              </button>
            )}
          </div>
        )}
      </div>
      <button
        className={`btn btn-sm flex-row btn-toolbar ml-auto${compact ? ' btn-active' : ''}`}
        onClick={onToggleDensity}
        title={compact ? t('viewComfortable', lang) : t('viewCompact', lang)}
        aria-label={compact ? t('ariaSwitchToComfortable', lang) : t('ariaSwitchToCompact', lang)}
      >
        <AlignJustify size={12} />
        {compact ? t('viewCompact', lang) : t('viewComfortable', lang)}
      </button>
      <div className="seg-control">
        <button
          className={`seg-control-btn pad-4-8${viewMode === 'card' ? ' active-worklog' : ''}`}
          onClick={() => onViewModeChange('card')}
          title={t('viewCard', lang)}
          aria-label={t('ariaCardView', lang)}
        >
          <LayoutGrid size={14} />
        </button>
        <button
          className={`seg-control-btn pad-4-8${viewMode === 'list' ? ' active-worklog' : ''}`}
          onClick={() => onViewModeChange('list')}
          title={t('viewList', lang)}
          aria-label={t('ariaListView', lang)}
        >
          <List size={14} />
        </button>
      </div>
    </div>
  );
});

// ─── Keywords bar ───
interface KeywordsBarProps {
  logs: LogEntry[];
  debouncedQuery: string;
  tagFilter?: string | null;
  modeFilter: ModeFilter;
  lang: Lang;
  onSetQuery: (q: string) => void;
}

export const KeywordsBar = memo(function KeywordsBar({ logs, debouncedQuery, tagFilter, modeFilter, lang, onSetQuery }: KeywordsBarProps) {
  const keywords = useMemo(() => extractKeywords(logs), [logs]);

  if (debouncedQuery.trim() || tagFilter || modeFilter !== 'all' || logs.length < 3 || keywords.length === 0) {
    return null;
  }

  return (
    <div className="flex-row flex-wrap mb-md gap-8">
      <span className="flex-row text-sm-muted gap-4">
        <TrendingUp size={12} />
        {t('topKeywords', lang)}:
      </span>
      {keywords.map((kw) => (
        <button
          type="button"
          key={kw.word}
          className="tag cursor-pointer fs-12 tag-btn"
          onClick={() => onSetQuery(kw.word)}
          aria-label={`${t('ariaFilterByKeyword', lang)}: ${kw.word}`}
        >
          {kw.word}
          <span className="ml-auto" style={{ fontSize: 10, opacity: 0.6 }}>{kw.count}</span>
        </button>
      ))}
    </div>
  );
});
