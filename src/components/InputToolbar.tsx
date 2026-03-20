import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { safeSetItem, addProject } from '../storage';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { Project } from '../types';
import type { TransformAction } from '../hooks/useTransform';
import type { ImportedFile } from '../hooks/useFileImport';

interface InputToolbarProps {
  transformAction: TransformAction;
  setTransformAction: (action: TransformAction) => void;
  selectedProjectId: string | undefined;
  setSelectedProjectId: (id: string | undefined) => void;
  loading: boolean;
  files: ImportedFile[];
  setFiles: (files: ImportedFile[]) => void;
  fileImportRef: React.RefObject<HTMLInputElement | null>;
  handleFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lang: Lang;
  projects: Project[];
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  onProjectAdded?: () => void;
}

export default memo(function InputToolbar({
  transformAction, setTransformAction, selectedProjectId, setSelectedProjectId,
  loading, files, setFiles, fileImportRef, handleFiles, lang, projects, showToast, onProjectAdded,
}: InputToolbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCreatingProject(false);
        setNewProjectName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Auto-focus input when creating
  useEffect(() => {
    if (creatingProject) newProjectInputRef.current?.focus();
  }, [creatingProject]);

  const handleCreateProject = useCallback(() => {
    const name = newProjectName.trim();
    if (!name) return;
    const project = addProject(name);
    setSelectedProjectId(project.id);
    setNewProjectName('');
    setCreatingProject(false);
    setDropdownOpen(false);
    onProjectAdded?.();
    showToast?.(t('projectCreated', lang), 'success');
  }, [newProjectName, setSelectedProjectId, onProjectAdded, showToast, lang]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  return (
    <div className="input-toolbar">
      <div className="input-toolbar-row">
        <div className="mode-selector" role="radiogroup" aria-label={t('ariaTransformMode', lang)}>
          {(['handoff', 'handoff_todo', 'todo_only'] as TransformAction[]).map((a) => {
            const isActive = transformAction === a;
            const isPrimary = a === 'handoff';
            const label = t(
              a === 'handoff_todo' ? 'modeLabelHandoffTodo'
              : a === 'handoff' ? 'modeLabelHandoff'
              : 'modeLabelTodoOnly',
              lang
            );
            const tooltip = t(
              a === 'handoff_todo' ? 'tooltipHandoffTodo'
              : a === 'handoff' ? 'tooltipHandoff'
              : 'tooltipTodoOnly',
              lang
            ) + '\n' + t(
              a === 'handoff_todo' ? 'tooltipHandoffTodoDesc'
              : a === 'handoff' ? 'tooltipHandoffDesc'
              : 'tooltipTodoOnlyDesc',
              lang
            );
            return (
              <button
                key={a}
                className={`mode-selector-btn${isActive ? ' active' : ''}${isPrimary ? ' mode-primary' : ' mode-secondary'}`}
                role="radio"
                aria-checked={isActive}
                title={tooltip}
                onClick={() => { setTransformAction(a); safeSetItem('threadlog_transform_action', a); }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="project-dropdown" ref={dropdownRef}>
          <button
            className={`input input-sm input-select-compact project-dropdown-trigger${selectedProject ? ' has-value' : ''}`}
            onClick={() => { if (!loading) setDropdownOpen((v) => !v); }}
            disabled={loading}
            aria-label={t('selectProject', lang)}
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
            type="button"
          >
            <span className="project-dropdown-label">{selectedProject ? selectedProject.name : t('selectProject', lang)}</span>
            <span className="project-dropdown-arrow" aria-hidden="true">{dropdownOpen ? '\u25B4' : '\u25BE'}</span>
          </button>
          {dropdownOpen && (
            <div className="project-dropdown-menu" role="listbox" aria-label={t('selectProject', lang)}>
              <button
                className={`project-dropdown-item${!selectedProjectId ? ' active' : ''}`}
                role="option"
                aria-selected={!selectedProjectId}
                onClick={() => { setSelectedProjectId(undefined); setDropdownOpen(false); }}
                type="button"
              >
                {t('selectProject', lang)}
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={`project-dropdown-item${p.id === selectedProjectId ? ' active' : ''}`}
                  role="option"
                  aria-selected={p.id === selectedProjectId}
                  onClick={() => { setSelectedProjectId(p.id); setDropdownOpen(false); }}
                  type="button"
                >
                  {p.icon ? `${p.icon} ${p.name}` : p.name}
                </button>
              ))}
              <div className="project-dropdown-divider" />
              {creatingProject ? (
                <div className="project-dropdown-create-form">
                  <input
                    ref={newProjectInputRef}
                    className="project-dropdown-create-input"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateProject();
                      if (e.key === 'Escape') { setCreatingProject(false); setNewProjectName(''); }
                    }}
                    placeholder={t('projectNamePlaceholder', lang)}
                    maxLength={50}
                  />
                  <button
                    className="project-dropdown-create-confirm"
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim()}
                    type="button"
                  >
                    {t('addBtn', lang)}
                  </button>
                </div>
              ) : (
                <button
                  className="project-dropdown-item project-dropdown-add"
                  onClick={() => setCreatingProject(true)}
                  type="button"
                >
                  + {t('newProject', lang)}
                </button>
              )}
            </div>
          )}
        </div>

        <input ref={fileImportRef} type="file" accept=".txt,.md,.docx,.json" multiple onChange={handleFiles} aria-label={t('ariaSelectFile', lang)} className="input-file-hidden" />
        <button className="input input-sm input-import-btn" onClick={() => fileImportRef.current?.click()} disabled={loading}>
          + {files.length === 0 ? t('importFiles', lang) : t('addMoreFiles', lang)}
        </button>

        {files.length > 0 && (
          <button className="btn-link clear-files-link" onClick={() => {
            const prevFiles = files;
            setFiles([]);
            if (prevFiles.length > 0) {
              showToast?.(t('inputCleared', lang) || 'Cleared', 'default', {
                label: t('undo', lang) || 'Undo',
                onClick: () => setFiles(prevFiles),
              });
            }
          }} disabled={loading}>
            {t('clearAllFiles', lang)}
          </button>
        )}
      </div>
    </div>
  );
});
