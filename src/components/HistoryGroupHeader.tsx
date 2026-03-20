import { memo } from 'react';
import { FolderOpen, Trash2, BookOpen } from 'lucide-react';
import type { Project } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';

// ---- Floating bulk action bar (bottom) ----

interface HistoryBulkBarProps {
  lang: Lang;
  selected: Set<string>;
  projects: Project[];
  projectPickerOpen: boolean;
  onSetProjectPickerOpen: (v: boolean) => void;
  onBulkDelete: () => void;
  onBulkAssignProject: (projectId: string) => void;
  onExitSelectMode: () => void;
}

export const HistoryBulkBar = memo(function HistoryBulkBar({
  lang, selected, projects, projectPickerOpen,
  onSetProjectPickerOpen, onBulkDelete, onBulkAssignProject, onExitSelectMode,
}: HistoryBulkBarProps) {
  return (
    <div className="flex-row bulk-bar">
      <span className="bulk-bar-label">
        {selected.size > 0 ? tf('selectedCount', lang, selected.size) : t('selectItems', lang)}
      </span>
      {selected.size > 0 && (
        <>
          <button className="btn btn-danger flex-row btn-sm-compact gap-xs" onClick={onBulkDelete}>
            <Trash2 size={13} />
            {t('bulkTrash', lang)}
          </button>
          {projects.length > 0 && (
            <div className="relative">
              <button className="btn flex-row btn-sm-compact gap-xs" onClick={() => onSetProjectPickerOpen(!projectPickerOpen)}>
                <FolderOpen size={13} />
                {t('bulkAssignProject', lang)}
              </button>
              {projectPickerOpen && (
                <div className="card-menu-dropdown" style={{ right: 'auto', left: 0, bottom: '100%', top: 'auto' }} onClick={(e) => e.stopPropagation()}>
                  {projects.map((p) => (
                    <button key={p.id} className="card-menu-item" onClick={() => onBulkAssignProject(p.id)}>{p.name}</button>
                  ))}
                  <button className="card-menu-item text-placeholder" onClick={() => onBulkAssignProject('')}>
                    {t('removeFromProject', lang)}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <button className="btn btn-sm-compact" onClick={onExitSelectMode}>
        {t('cancel', lang)}
      </button>
    </div>
  );
});

// ---- History page header ----

interface HistoryPageHeaderProps {
  lang: Lang;
  sortedCount: number;
  activeProjectId: string | null;
  projects: Project[];
  selectMode: boolean;
  selectedCount: number;
  showBack: boolean;
  hasMasterNote: boolean;
  onBack: () => void;
  onToggleAll: () => void;
  onStartSelect: () => void;
  onOpenLogPicker: () => void;
  onOpenMasterNote?: (projectId: string) => void;
}

export const HistoryPageHeader = memo(function HistoryPageHeader({
  lang, sortedCount, activeProjectId, projects, selectMode, selectedCount,
  showBack, hasMasterNote, onBack, onToggleAll, onStartSelect, onOpenLogPicker, onOpenMasterNote,
}: HistoryPageHeaderProps) {
  return (
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
          <p className="page-subtitle">{tf('logCount', lang, sortedCount)}</p>
        </div>
        <div className="flex gap-6">
          {!selectMode && activeProjectId && onOpenMasterNote && (
            <button
              className="btn flex-row btn-sm-compact gap-xs"
              onClick={() => onOpenMasterNote(activeProjectId)}
            >
              <BookOpen size={12} />
              {hasMasterNote ? t('projectSummaryOpen', lang) : t('projectSummaryCreate', lang)}
            </button>
          )}
          {!selectMode && activeProjectId && (
            <button className="btn btn-primary btn-sm-compact" onClick={onOpenLogPicker}>
              {t('addLogsToProject', lang)}
            </button>
          )}
          {!selectMode && sortedCount > 0 && (
            <button className="btn btn-sm-compact" onClick={onStartSelect}>
              {t('selectMode', lang)}
            </button>
          )}
          {selectMode && (
            <button className="btn btn-sm-compact" onClick={onToggleAll}>
              {selectedCount === sortedCount ? t('deselectAll', lang) : t('selectAll', lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
