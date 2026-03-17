import { useState } from 'react';
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

export function BulkActionBar({
  lang, selected, projects,
  onBulkDelete, onBulkAssignProject, onExitSelectMode,
}: BulkActionBarProps) {
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  return (
    <div className="flex-row" style={{
      position: 'sticky',
      bottom: 0,
      background: 'var(--bg-primary)',
      borderTop: '1px solid var(--border-default)',
      padding: 12,
      gap: 8,
      zIndex: 100,
      boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
    }}>
      <span style={{ fontWeight: 600, fontSize: 13, marginRight: 'auto' }}>
        {selected.size > 0 ? tf('selectedCount', lang, selected.size) : t('selectItems', lang)}
      </span>
      {selected.size > 0 && (
        <>
          <button className="btn btn-danger flex-row" style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, gap: 4 }} onClick={onBulkDelete}>
            <Trash2 size={13} />
            {t('bulkTrash', lang)}
          </button>
          {projects.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button className="btn flex-row" style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, gap: 4 }} onClick={() => setProjectPickerOpen(!projectPickerOpen)}>
                <FolderOpen size={13} />
                {t('bulkAssignProject', lang)}
              </button>
              {projectPickerOpen && (
                <div className="card-menu-dropdown" style={{ right: 'auto', left: 0, bottom: '100%', top: 'auto' }} onClick={(e) => e.stopPropagation()}>
                  {projects.map((p) => (
                    <button key={p.id} className="card-menu-item" onClick={() => { onBulkAssignProject(p.id); setProjectPickerOpen(false); }}>{p.name}</button>
                  ))}
                  <button className="card-menu-item" style={{ color: 'var(--text-placeholder)' }} onClick={() => { onBulkAssignProject(''); setProjectPickerOpen(false); }}>
                    {t('removeFromProject', lang)}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <button className="btn" style={{ fontSize: 12, padding: '4px 10px', minHeight: 26 }} onClick={onExitSelectMode}>
        {t('cancel', lang)}
      </button>
    </div>
  );
}
