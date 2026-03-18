import { safeSetItem } from '../storage';
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
}

export default function InputToolbar({
  transformAction, setTransformAction, selectedProjectId, setSelectedProjectId,
  loading, files, setFiles, fileImportRef, handleFiles, lang, projects, showToast,
}: InputToolbarProps) {
  return (
    <div className="flex-col input-toolbar">
      <div className="flex-row flex-wrap gap-10">
        <div className="mode-selector" role="radiogroup" aria-label={t('ariaTransformMode', lang)}>
          {(['handoff', 'handoff_todo', 'todo_only'] as TransformAction[]).map((a) => {
            const isActive = transformAction === a;
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
            );
            return (
              <button
                key={a}
                className={`mode-selector-btn${isActive ? ' active' : ''}`}
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

        <select
          className="input input-sm input-select-compact"
          value={selectedProjectId ?? ''}
          onChange={(e) => setSelectedProjectId(e.target.value || undefined)}
          disabled={loading}
          aria-label={t('selectProject', lang)}
        >
          <option value="">{t('selectProject', lang)}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <input ref={fileImportRef} type="file" accept=".txt,.md,.docx,.json" multiple onChange={handleFiles} aria-label={t('ariaSelectFile', lang)} style={{ display: 'none' }} />
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
}
