import { useState } from 'react';
import { Undo2, Trash2 } from 'lucide-react';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import {
  loadTrashedLogs, loadTrashedProjects, loadTrashedTodos,
  restoreLog, restoreProject, restoreTodo,
  deleteLog, deleteProject, deleteTodo,
} from './storage';
import ConfirmDialog from './ConfirmDialog';

type Filter = 'all' | 'logs' | 'projects' | 'todos';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface TrashItem {
  id: string;
  type: 'log' | 'project' | 'todo';
  title: string;
  trashedAt: number;
}

interface TrashViewProps {
  onBack: () => void;
  onRefresh: () => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

function daysLeft(trashedAt: number): number {
  const expires = trashedAt + TRASH_RETENTION_MS;
  const ms = expires - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function TrashView({ onBack, onRefresh, lang, showToast }: TrashViewProps) {
  const [version, setVersion] = useState(0);
  void version;
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDelete, setConfirmDelete] = useState<TrashItem | null>(null);
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const TRASH_PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(TRASH_PAGE_SIZE);
  // Reset pagination when filter/search changes
  const [prevFilter, setPrevFilter] = useState({ filter, searchQuery });
  if (prevFilter.filter !== filter || prevFilter.searchQuery !== searchQuery) {
    setPrevFilter({ filter, searchQuery });
    setVisibleCount(TRASH_PAGE_SIZE);
  }

  const refresh = () => { setVersion((v) => v + 1); onRefresh(); };

  const trashedLogs = loadTrashedLogs();
  const trashedProjects = loadTrashedProjects();
  const trashedTodos = loadTrashedTodos();

  const items: TrashItem[] = [];

  if (filter === 'all' || filter === 'logs') {
    for (const l of trashedLogs) {
      items.push({ id: l.id, type: 'log', title: l.title, trashedAt: l.trashedAt! });
    }
  }
  if (filter === 'all' || filter === 'projects') {
    for (const p of trashedProjects) {
      items.push({ id: p.id, type: 'project', title: p.name, trashedAt: p.trashedAt! });
    }
  }
  if (filter === 'all' || filter === 'todos') {
    for (const td of trashedTodos) {
      items.push({ id: td.id, type: 'todo', title: td.text, trashedAt: td.trashedAt! });
    }
  }

  // Sort by most recently trashed first
  items.sort((a, b) => b.trashedAt - a.trashedAt);

  // Search filter
  const filteredItems = searchQuery.trim()
    ? items.filter((item) => item.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : items;

  const handleRestore = (item: TrashItem) => {
    switch (item.type) {
      case 'log': restoreLog(item.id); break;
      case 'project': restoreProject(item.id); break;
      case 'todo': restoreTodo(item.id); break;
    }
    refresh();
    showToast?.(t('trashRestore', lang), 'success');
  };

  const handleDeletePermanent = (item: TrashItem) => {
    setConfirmDelete(item);
  };

  const executeDeletePermanent = () => {
    if (!confirmDelete) return;
    switch (confirmDelete.type) {
      case 'log': deleteLog(confirmDelete.id); break;
      case 'project': deleteProject(confirmDelete.id); break;
      case 'todo': deleteTodo(confirmDelete.id); break;
    }
    setConfirmDelete(null);
    refresh();
    showToast?.(t('trashDeletePermanent', lang), 'success');
  };

  const handleEmptyAll = () => {
    setConfirmEmptyAll(true);
  };

  const executeEmptyAll = () => {
    for (const l of trashedLogs) deleteLog(l.id);
    for (const p of trashedProjects) deleteProject(p.id);
    for (const td of trashedTodos) deleteTodo(td.id);
    setConfirmEmptyAll(false);
    refresh();
    showToast?.(t('trashEmptyAll', lang), 'success');
  };

  const totalCount = trashedLogs.length + trashedProjects.length + trashedTodos.length;

  const typeBadge = (type: TrashItem['type']) => {
    const typeLabels = { log: t('trashTypeLog', lang), project: t('trashTypeProject', lang), todo: t('trashTypeTodo', lang) };
    const classes = { log: 'badge-worklog', project: 'badge-project', todo: 'badge-todo' };
    return <span className={classes[type] || 'badge-worklog'} style={{ fontSize: 10, padding: '1px 6px' }}>{typeLabels[type]}</span>;
  };

  return (
    <div className="workspace-content-wide">
      <div className="page-header">
        <button className="btn-back btn-back-mb" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <div className="page-header-row">
          <div>
            <h2>{t('trashTitle', lang)}</h2>
            <p className="page-subtitle">
              {totalCount > 0
                ? tf('trashItemCount', lang, totalCount)
                : ''}
            </p>
          </div>
          {totalCount > 0 && (
            <button className="btn btn-danger btn-sm-trash" style={{ padding: '4px 12px' }} onClick={handleEmptyAll}>
              <Trash2 size={12} /> {t('trashEmptyAll', lang)}
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs + search */}
      {totalCount > 0 && (
        <div className="content-card toolbar-card-mb">
          <div className="seg-control">
            {([
              { key: 'all', label: t('trashFilterAll', lang), count: totalCount },
              { key: 'logs', label: t('trashFilterLogs', lang), count: trashedLogs.length },
              { key: 'projects', label: t('trashFilterProjects', lang), count: trashedProjects.length },
              { key: 'todos', label: t('trashFilterTodos', lang), count: trashedTodos.length },
            ] as const).map((f) => (
              <button
                key={f.key}
                className={`seg-control-btn${filter === f.key ? ' active-worklog' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          <input
            className="input input-sm flex-1"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchLogs', lang)}
            maxLength={200}
            style={{ minWidth: 120 }}
          />
        </div>
      )}

      {/* Items */}
      {filteredItems.length === 0 && items.length > 0 ? (
        <div className="empty-state">
          <p>{t('noMatches', lang)}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128465;</div>
          <p>{t('trashEmpty', lang)}</p>
          <p className="page-subtitle">{t('trashEmptyDesc', lang)}</p>
        </div>
      ) : (
        <div className="flex-col" style={{ gap: 6 }}>
          {filteredItems.slice(0, visibleCount).map((item) => {
            const days = daysLeft(item.trashedAt);
            return (
              <div key={`${item.type}-${item.id}`} className="card flex-row" style={{ gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex-row-gap-sm" style={{ marginBottom: 2 }}>
                    {typeBadge(item.type)}
                    <span className="trash-item-title">
                      {item.title}
                    </span>
                  </div>
                  <span className="meta text-xs">
                    {tf('trashDaysLeft', lang, days)}
                  </span>
                </div>
                <div className="trash-actions">
                  <button className="btn btn-sm-compact" onClick={() => handleRestore(item)}>
                    <Undo2 size={12} /> {t('trashRestore', lang)}
                  </button>
                  <button className="btn btn-danger btn-sm-compact" onClick={() => handleDeletePermanent(item)} aria-label={t('ariaDeletePermanently', lang)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredItems.length > visibleCount && (
            <div className="text-center" style={{ padding: '16px 0' }}>
              <button className="btn text-sm" onClick={() => setVisibleCount((v) => v + TRASH_PAGE_SIZE)}>
                {tf('loadMore', lang, filteredItems.length - visibleCount)}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('trashDeleteConfirm', lang)}
          description={t('trashCannotUndo', lang)}
          confirmLabel={t('trashDeletePermanent', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={executeDeletePermanent}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmEmptyAll && (
        <ConfirmDialog
          title={t('trashEmptyAllConfirm', lang)}
          description={t('trashEmptyAllDesc', lang)}
          confirmLabel={t('trashEmptyAll', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={executeEmptyAll}
          onCancel={() => setConfirmEmptyAll(false)}
        />
      )}
    </div>
  );
}
