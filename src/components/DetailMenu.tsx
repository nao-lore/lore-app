import { Share2 } from 'lucide-react';
import { duplicateLog } from '../storage';
import { logToMarkdown } from '../markdown';
import { downloadFile } from '../utils/downloadFile';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { LogEntry, Project } from '../types';

interface DetailMenuProps {
  log: LogEntry;
  lang: Lang;
  menuOpen: boolean;
  projectPickerOpen: boolean;
  copied: boolean;
  projects: Project[];
  onCopy: () => void;
  onCopyWithContext: () => void;
  onDelete: () => void;
  onShare: () => void;
  onAssignProject: (projectId: string) => void;
  onOpenLog: (id: string) => void;
  onRefresh: () => void;
  setMenuOpen: (v: boolean) => void;
  setProjectPickerOpen: (v: boolean) => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
}

export default function DetailMenu({
  log, lang, menuOpen, projectPickerOpen, copied, projects,
  onCopy, onCopyWithContext, onDelete, onShare, onAssignProject,
  onOpenLog, onRefresh, setMenuOpen, setProjectPickerOpen, showToast,
}: DetailMenuProps) {
  const handleDetailExport = (format: 'md' | 'json') => {
    const date = new Date(log.createdAt).toISOString().slice(0, 10);
    const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
    if (format === 'md') {
      downloadFile(logToMarkdown(log), `threadlog-${date}-${type}.md`, 'text/markdown');
    } else {
      const { sourceText: _sourceText, ...exportData } = log;
      downloadFile(JSON.stringify(exportData, null, 2), `threadlog-${date}-${type}.json`, 'application/json');
    }
    setMenuOpen(false);
  };

  return (
    <>
      {menuOpen && (
        <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          {projects.length > 0 && (
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); setProjectPickerOpen(true); }}>
              {t('editProject', lang)}
            </button>
          )}
          <button className="card-menu-item" onClick={onCopy}>
            {copied ? t('copied', lang) : t('copyMarkdown', lang)}
          </button>
          <button className="card-menu-item" onClick={onCopyWithContext}>
            {t('copyWithContext', lang)}
          </button>
          <button className="card-menu-item" onClick={() => handleDetailExport('md')}>
            {t('exportMd', lang)}
          </button>
          <button className="card-menu-item" onClick={() => handleDetailExport('json')}>
            {t('exportJson', lang)}
          </button>
          {typeof navigator.share === 'function' && (
            <button className="card-menu-item" onClick={onShare}>
              <Share2 size={14} /> {t('share', lang)}
            </button>
          )}
          <button className="card-menu-item" onClick={() => {
            setMenuOpen(false);
            const suffix = t('duplicateLogSuffix', lang);
            const newId = duplicateLog(log.id, suffix);
            if (newId) {
              onRefresh();
              showToast?.(t('duplicateLogDone', lang), 'success');
              onOpenLog(newId);
            }
          }}>
            {t('duplicateLog', lang)}
          </button>
          <button className="card-menu-item card-menu-item-danger" onClick={onDelete}>
            {t('delete', lang)}
          </button>
        </div>
      )}
      {projectPickerOpen && (
        <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          {projects.map((p) => (
            <button
              key={p.id}
              className="card-menu-item"
              onClick={() => onAssignProject(p.id)}
              style={log.projectId === p.id ? { fontWeight: 600, color: 'var(--accent-text)' } : undefined}
            >
              {p.name}
            </button>
          ))}
          <button className="card-menu-item text-placeholder" onClick={() => onAssignProject('')}>
            {t('removeFromProject', lang)}
          </button>
        </div>
      )}
    </>
  );
}
