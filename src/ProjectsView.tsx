import { useState, useEffect, useRef } from 'react';
import { usePersistedState } from './usePersistedState';
import { Plus, Pin, MoreHorizontal, Pencil, FileText, Trash2, FolderOpen, ExternalLink, Palette } from 'lucide-react';
import type { Project, LogEntry } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { addProject, trashProject, renameProject, updateProject } from './storage';
import DropdownMenu from './DropdownMenu';
import ConfirmDialog from './ConfirmDialog';
import ProjectAppearanceModal from './ProjectAppearanceModal';
import { getProjectColor } from './projectColors';
import { EmptyProjects } from './EmptyIllustrations';

type SortKey = 'created' | 'name' | 'logCount';

interface ProjectsViewProps {
  projects: Project[];
  logs: LogEntry[];
  onBack: () => void;
  onSelectProject: (id: string) => void;
  onOpenMasterNote: (projectId: string) => void;
  onRefresh: () => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

// ─── Project Context Menu (inline dropdown) ───
function ProjectContextMenu({ project, logCount, lang, onClose, onAction }: {
  project: Project;
  logCount: number;
  lang: Lang;
  onClose: () => void;
  onAction: (action: string, value?: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className="dropdown-menu min-w-200" style={{ top: '100%', right: 0 }}>
      <button className="mn-export-item" onClick={() => { onAction('viewLogs'); onClose(); }}>
        <FolderOpen size={14} />
        <span>{t('projectOpenLogs', lang)}</span>
        <span className="ml-auto" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tf('logCount', lang, logCount)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('pin'); onClose(); }}>
        <Pin size={14} className="pin-rotate" />
        <span>{project.pinned ? t('unpinProject', lang) : t('pinProject', lang)}</span>
      </button>
      <div className="mn-export-divider" />
      <button className="mn-export-item" onClick={() => { onAction('rename'); onClose(); }}>
        <Pencil size={14} />
        <span>{t('renameProject', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('masterNote'); onClose(); }}>
        <FileText size={14} />
        <span>{t('projectOpenMasterNote', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('addLogs'); onClose(); }}>
        <ExternalLink size={14} />
        <span>{t('projectAddLogs', lang)}</span>
      </button>
      <button className="mn-export-item" onClick={() => { onAction('appearance'); onClose(); }}>
        <Palette size={14} />
        <span>{t('projectEditAppearance', lang)}</span>
      </button>
      <div className="mn-export-divider" />
      <button className="mn-export-item" onClick={() => { onAction('delete'); onClose(); }} style={{ color: 'var(--error-text)' }}>
        <Trash2 size={14} />
        <span>{t('moveToTrash', lang)}</span>
      </button>
    </div>
  );
}

// ─── Main ProjectsView ───
const MAX_PINNED_PROJECTS = 5;

export default function ProjectsView({ projects, logs, onBack, onSelectProject, onOpenMasterNote, onRefresh, lang, showToast }: ProjectsViewProps) {
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectNameError, setProjectNameError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('threadlog_projects_sort', 'created');
  const [actionSheetProject, setActionSheetProject] = useState<Project | null>(null);
  const [confirmTrashProject, setConfirmTrashProject] = useState<Project | null>(null);
  const [appearanceProject, setAppearanceProject] = useState<Project | null>(null);
  const [hideEmpty, setHideEmpty] = usePersistedState<string>('threadlog_projects_hide_empty', 'false');


  const handleAddProject = () => {
    const name = newProjectName.trim();
    if (!name) {
      setProjectNameError(t('projectNameRequired', lang));
      return;
    }
    setProjectNameError('');
    addProject(name);
    setNewProjectName('');
    setAddingProject(false);
    onRefresh();
    showToast?.(t('projectCreated', lang), 'success');
  };

  const logCountForProject = (projectId: string) => logs.filter((l) => l.projectId === projectId).length;

  const handleAction = (project: Project, action: string) => {
    switch (action) {
      case 'viewLogs':
        onSelectProject(project.id);
        break;
      case 'pin':
        if (!project.pinned && projects.filter((p) => p.pinned).length >= MAX_PINNED_PROJECTS) {
          showToast?.(t('pinLimitReached', lang), 'error');
          break;
        }
        updateProject(project.id, { pinned: !project.pinned });
        onRefresh();
        break;
      case 'rename':
        setEditingId(project.id);
        setEditName(project.name);
        break;
      case 'masterNote':
        onOpenMasterNote(project.id);
        break;
      case 'addLogs':
        onSelectProject(project.id);
        break;
      case 'appearance':
        setAppearanceProject(project);
        break;
      case 'delete':
        setConfirmTrashProject(project);
        break;
    }
  };

  const handleRenameProject = (id: string) => {
    const name = editName.trim();
    if (!name) {
      setProjectNameError(t('projectNameRequired', lang));
      return;
    }
    setProjectNameError('');
    renameProject(id, name);
    setEditingId(null);
    onRefresh();
    showToast?.(t('renamed', lang), 'success');
  };

  // Filter
  let filtered = query.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : projects;
  if (hideEmpty === 'true') {
    filtered = filtered.filter((p) => logCountForProject(p.id) > 0);
  }

  // Sort (pinned always first)
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    switch (sortKey) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'logCount':
        return logCountForProject(b.id) - logCountForProject(a.id);
      case 'created':
      default:
        return b.createdAt - a.createdAt;
    }
  });

  const sortOptions = [
    { key: 'created', label: t('sortCreated', lang) },
    { key: 'name', label: t('sortName', lang) },
    { key: 'logCount', label: t('sortLogCount', lang) },
  ];

  return (
    <div className="workspace-content-wide">
      <div className="page-header page-header-sticky">
        <button className="btn-back btn-back-mb" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2>{t('projects', lang)}</h2>
            <p className="page-subtitle">{tf('projectCount', lang, projects.length)}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setAddingProject(true)}>
            <Plus size={14} /> {t('newProject', lang)}
          </button>
        </div>
      </div>

      {/* Toolbar: search + sort */}
      <div className="content-card toolbar-card-mb">
        <input
          className="input input-sm flex-1"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchProjects', lang)}
          aria-label={t('searchProjects', lang)}
          maxLength={200}
          style={{ minWidth: 140 }}
        />
        <DropdownMenu
          label={t('sortLabel', lang)}
          value={sortKey}
          options={sortOptions}
          onChange={(k) => setSortKey(k as SortKey)}
        />
        <label className="flex-row-gap-2 text-sm text-muted cursor-pointer select-none nowrap">
          <input
            type="checkbox"
            checked={hideEmpty === 'true'}
            onChange={(e) => setHideEmpty(e.target.checked ? 'true' : 'false')}
            style={{ accentColor: 'var(--accent)' }}
          />
          {t('hideEmptyProjects', lang)}
        </label>
      </div>

      {/* Add project form */}
      {addingProject && (
        <div className="content-card flex-row-gap-sm flex-wrap mb-lg">
          <input
            className="input flex-1"
            value={newProjectName}
            onChange={(e) => { setNewProjectName(e.target.value); setProjectNameError(''); }}
            onBlur={() => { if (newProjectName.trim() === '') setProjectNameError(t('projectNameRequired', lang)); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddProject();
              if (e.key === 'Escape') { setAddingProject(false); setNewProjectName(''); setProjectNameError(''); }
            }}
            placeholder={t('projectNamePlaceholder', lang)}
            aria-label={t('projectNamePlaceholder', lang)}
            autoFocus
            maxLength={200}
          />
          <button className="btn btn-primary" onClick={handleAddProject}>
            {t('addBtn', lang)}
          </button>
          <button className="btn" onClick={() => { setAddingProject(false); setNewProjectName(''); setProjectNameError(''); }}>
            {t('cancel', lang)}
          </button>
          {projectNameError && (
            <p className="error-text-sm" style={{ margin: 0, width: '100%' }}>{projectNameError}</p>
          )}
        </div>
      )}

      {/* Project grid */}
      {sorted.length === 0 ? (
        <div className="empty-state">
          {!query.trim() && <EmptyProjects />}
          <p>{query.trim() ? t('noMatches', lang) : t('noProjects', lang)}</p>
          {!query.trim() && <p className="page-subtitle">{t('noProjectsDesc', lang)}</p>}
          {!query.trim() && (
            <button className="btn btn-primary" onClick={() => setAddingProject(true)}>
              {t('newProject', lang)}
            </button>
          )}
        </div>
      ) : (
        <div className="page-grid page-grid-2">
          {sorted.map((p) => {
            const count = logCountForProject(p.id);
            const pColor = getProjectColor(p.color);
            return (
              <button
                type="button"
                key={p.id}
                className={`content-card content-card-clickable content-card-btn${p.pinned ? ' content-card-line-pinned' : ''}`}
                onClick={() => onSelectProject(p.id)}
                aria-label={`${t('ariaOpenProject', lang)}: ${p.name}`}
                style={{
                  position: 'relative',
                  borderLeft: pColor ? `3px solid ${pColor}` : undefined,
                }}
              >
                {/* Three-dot menu — right side, fixed */}
                <div className="absolute" style={{ top: 14, right: 14 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="action-menu-btn"
                    onClick={() => setActionSheetProject(actionSheetProject?.id === p.id ? null : p)}
                    aria-label={t('ariaMenu', lang)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {actionSheetProject?.id === p.id && (
                    <ProjectContextMenu
                      project={p}
                      logCount={count}
                      lang={lang}
                      onClose={() => setActionSheetProject(null)}
                      onAction={(action) => handleAction(p, action)}
                    />
                  )}
                </div>

                {/* Name / edit */}
                {editingId === p.id ? (
                  <input
                    className="input input-sm"
                    value={editName}
                    aria-label={t('ariaRenameInput', lang)}
                    onChange={(e) => { setEditName(e.target.value); setProjectNameError(''); }}
                    onBlur={() => handleRenameProject(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameProject(p.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    maxLength={200}
                    style={{ fontSize: 14, minHeight: 0 }}
                  />
                ) : (
                  <>
                    <div className="flex-row-gap-2" style={{ marginBottom: 4, paddingRight: 48 }}>
                      {p.icon && (
                        <span className="shrink-0" style={{ fontSize: 18, lineHeight: 1 }}>{p.icon}</span>
                      )}
                      {p.pinned && (
                        <Pin size={12} style={{ color: 'var(--accent)', flexShrink: 0, transform: 'rotate(45deg)' }} />
                      )}
                      <span className="font-semibold" style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p.name}</span>
                    </div>
                    <div className="meta" style={{ fontSize: 12, paddingLeft: p.icon ? 30 : 0 }}>
                      {tf('logCount', lang, count)}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {confirmTrashProject && (
        <ConfirmDialog
          title={t('deleteProjectConfirm', lang)}
          description={t('deleteProjectConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { trashProject(confirmTrashProject.id); setConfirmTrashProject(null); onRefresh(); showToast?.(t('moveToTrash', lang), 'success'); }}
          onCancel={() => setConfirmTrashProject(null)}
        />
      )}
      {appearanceProject && (
        <ProjectAppearanceModal
          project={appearanceProject}
          lang={lang}
          onClose={() => setAppearanceProject(null)}
          onUpdated={onRefresh}
        />
      )}
    </div>
  );
}
