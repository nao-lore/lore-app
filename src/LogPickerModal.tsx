import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { LogEntry, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { matchesLogQuery } from './search';
import ConfirmDialog from './ConfirmDialog';
import { formatDateOnly } from './utils/dateFormat';
import { useFocusTrap } from './useFocusTrap';

interface LogPickerModalProps {
  allLogs: LogEntry[];
  targetProjectId: string;
  projects: Project[];
  lang: Lang;
  onConfirm: (logIds: string[]) => void;
  onClose: () => void;
}

export default function LogPickerModal({ allLogs, targetProjectId, projects, lang, onConfirm, onClose }: LogPickerModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [query, setQueryRaw] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMove, setConfirmMove] = useState(false);
  const PICKER_PAGE_SIZE = 20;
  const [pickerVisibleCount, setPickerVisibleCount] = useState(PICKER_PAGE_SIZE);
  const setQuery = useCallback((q: string) => { setQueryRaw(q); setPickerVisibleCount(PICKER_PAGE_SIZE); }, []);

  // Show logs not in this project
  const available = allLogs.filter((l) => l.projectId !== targetProjectId);

  const filtered = query.trim()
    ? available.filter((l) => matchesLogQuery(l, query))
    : available;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;

    // Check if any selected logs belong to another project
    const movingLogs = allLogs.filter((l) => selected.has(l.id) && l.projectId && l.projectId !== targetProjectId);
    if (movingLogs.length > 0) {
      setConfirmMove(true);
      return;
    }

    onConfirm(Array.from(selected));
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name ?? null;
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={trapRef} className="modal-content log-picker-modal" role="dialog" aria-modal="true" aria-labelledby="log-picker-title" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="log-picker-header">
          <h3 id="log-picker-title" className="log-picker-title">
            {t('addLogsTitle', lang)}
          </h3>
          <button className="sidebar-icon-btn shrink-0" onClick={onClose} aria-label={t('ariaClose', lang)}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="log-picker-search-pad">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('addLogsSearchPlaceholder', lang)}
            autoFocus
            maxLength={200}
            className="input w-full"
          />
        </div>

        {/* Log list */}
        <div className="log-picker-list">
          {available.length === 0 ? (
            <p className="log-picker-empty">{t('addLogsNoUnassigned', lang)}</p>
          ) : filtered.length === 0 ? (
            <p className="log-picker-empty">{t('addLogsNoResults', lang)}</p>
          ) : (
            filtered.slice(0, pickerVisibleCount).map((log) => {
              const isSelected = selected.has(log.id);
              const projectName = getProjectName(log.projectId);
              return (
                <div
                  key={log.id}
                  className={`log-picker-item${isSelected ? ' selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelect(log.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(log.id); } }}
                >
                  <input
                    type="checkbox"
                    className="bulk-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(log.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="log-picker-item-detail">
                    <div className="log-picker-item-header">
                      <span className={log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                        {log.outputMode === 'handoff' ? 'H' : 'W'}
                      </span>
                      <span className="log-picker-item-title">
                        {log.title}
                      </span>
                    </div>
                    <div className="log-picker-item-meta">
                      <span>{formatDateOnly(log.createdAt)}</span>
                      {projectName && (
                        <span style={{ color: 'var(--accent-text)' }}>{projectName}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {filtered.length > pickerVisibleCount && (
            <div className="log-picker-load-more">
              <button className="btn fs-13" onClick={() => setPickerVisibleCount((v) => v + PICKER_PAGE_SIZE)}>
                {tf('loadMore', lang, filtered.length - pickerVisibleCount)}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="log-picker-footer">
          <button className="btn" onClick={onClose}>
            {t('addLogsCancel', lang)}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            {selected.size > 0 ? tf('addLogsConfirm', lang, selected.size) : t('addLogsToProject', lang)}
          </button>
        </div>
      </div>

      {confirmMove && (
        <ConfirmDialog
          title={tf('addLogsMoveConfirm', lang, allLogs.filter((l) => selected.has(l.id) && l.projectId && l.projectId !== targetProjectId).length)}
          confirmLabel={t('classifyAccept', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { setConfirmMove(false); onConfirm(Array.from(selected)); }}
          onCancel={() => setConfirmMove(false)}
          danger={false}
        />
      )}
    </div>
  );
}
