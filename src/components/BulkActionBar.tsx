import { useState, memo } from 'react';
import { Trash2, FolderOpen } from 'lucide-react';
import type { Project } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';

interface BulkActionBarProps {
  lang: Lang;
  selected: Set<string>;
  projects: Project[];
  onBulkDelete: () => void;
  onBulkAssignProject: (projectId: string) => void;
  onExitSelectMode: () => void;
}

export const BulkActionBar = memo(function BulkActionBar({
  lang, selected, projects,
  onBulkDelete, onBulkAssignProject, onExitSelectMode,
}: BulkActionBarProps) {
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  return (
    <div className="flex-row bulk-action-bar">
      <span className="bulk-action-bar-label">
        {selected.size > 0 ? tf('selectedCount', lang, selected.size) : t('selectItems', lang)}
      </span>
      {selected.size > 0 && (
        <>
          <button className="btn btn-danger flex-row btn-compact" onClick={onBulkDelete}>
            <Trash2 size={13} />
            {t('bulkTrash', lang)}
          </button>
          {projects.length > 0 && (
            <div className="bulk-project-picker">
              <button className="btn flex-row btn-compact" onClick={() => setProjectPickerOpen(!projectPickerOpen)}>
                <FolderOpen size={13} />
                {t('bulkAssignProject', lang)}
              </button>
              {projectPickerOpen && (
                <div className="card-menu-dropdown bulk-project-dropdown" onClick={(e) => e.stopPropagation()}>
                  {projects.map((p) => (
                    <button key={p.id} className="card-menu-item" onClick={() => { onBulkAssignProject(p.id); setProjectPickerOpen(false); }}>{p.name}</button>
                  ))}
                  <button className="card-menu-item text-placeholder-color" onClick={() => { onBulkAssignProject(''); setProjectPickerOpen(false); }}>
                    {t('removeFromProject', lang)}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <button className="btn btn-compact" onClick={onExitSelectMode}>
        {t('cancel', lang)}
      </button>
    </div>
  );
});
