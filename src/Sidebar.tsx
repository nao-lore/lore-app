import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ScrollText, Folder, CheckSquare, MoreHorizontal, Settings, Trash2, HelpCircle, ChevronUp, ChevronDown, ChevronRight, BarChart2, MessageSquare, Menu, CreditCard, User, LayoutDashboard, PenSquare, FolderKanban } from 'lucide-react';
import type { LogEntry, Project, Todo, MasterNote } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import { updateLog, trashLog, safeGetItem, safeSetItem } from './storage';
import ContextMenu from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import FeedbackModal from './FeedbackModal';
import { getProjectColor } from './projectColors';
import { useFocusTrap } from './useFocusTrap';
import { isStaleMasterNote } from './utils/staleness';
import { isPro } from './utils/proManager';


function formatNumber(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

interface Stats {
  total: number; worklogs: number; handoffs: number; projects: number;
  todoPending: number; todoDone: number; todoTotal: number; totalChars: number;
}

function StatsModal({ stats, lang, onClose, onOpenHistory, onOpenProjects, onOpenTodos }: {
  stats: Stats; lang: Lang; onClose: () => void;
  onOpenHistory: () => void; onOpenProjects: () => void; onOpenTodos: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const rows: { label: string; value: string; onClick?: () => void; indent?: boolean }[] = [
    { label: t('statsTotalLogs', lang), value: String(stats.total), onClick: onOpenHistory },
    { label: t('statsWorklogs', lang), value: String(stats.worklogs), onClick: onOpenHistory, indent: true },
    { label: t('statsHandoffs', lang), value: String(stats.handoffs), onClick: onOpenHistory, indent: true },
    { label: t('statsProjects', lang), value: String(stats.projects), onClick: onOpenProjects },
    { label: t('statsTodos', lang), value: `${stats.todoTotal}（${stats.todoPending} ${t('statsTodoPending', lang)} / ${stats.todoDone} ${t('statsTodoDone', lang)}）`, onClick: onOpenTodos },
    { label: t('statsTotalChars', lang), value: formatNumber(stats.totalChars) },
  ];

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        className="shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('statsTitle', lang)}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-lg modal-heading-md">{t('statsTitle', lang)}</h3>
        <div className="flex-col">
          {rows.map((row) => (
            <div
              key={row.label}
              className="stats-row"
              style={row.onClick ? { cursor: 'pointer' } : undefined}
              onClick={row.onClick ? () => { onClose(); row.onClick!(); } : undefined}
            >
              <span className="text-md" style={{ color: row.indent ? 'var(--text-muted)' : 'var(--text-body)', paddingLeft: row.indent ? 12 : 0 }}>{row.label}</span>
              <span className="stats-value">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="mb-lg text-right">
          <button className="btn modal-close-sm" onClick={onClose}>
            {t('close', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SidebarProps {
  logs: LogEntry[];
  projects: Project[];
  selectedId: string | null;
  activeProjectId: string | null;
  activeView: string;
  onSelect: (id: string) => void;
  onNewLog: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenProjects: () => void;
  onOpenTodos: () => void;
  onOpenProjectSummaryList: () => void;
  onOpenDashboard: () => void;
  onOpenTimeline: () => void;
  onOpenWeeklyReport?: () => void;
  onOpenTrash: () => void;
  onOpenHelp: () => void;
  onOpenPricing?: () => void;
  onCollapse: () => void;
  onHide?: () => void;
  onSelectProject: (id: string) => void;
  onOpenMasterNote: (projectId: string) => void;
  onRefresh: () => void;
  onDeleted?: () => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  todos: Todo[];
  masterNotes: MasterNote[];
}

const MAX_PINNED = 5;
const SIDEBAR_PINNED_KEY = 'threadlog_sidebar_pinned';
const NOTIFICATION_DISMISSALS_KEY = 'threadlog_notification_dismissals';

function Sidebar({ logs, projects, selectedId, activeProjectId, activeView, onSelect, onNewLog, onOpenSettings, onOpenHistory, onOpenProjects, onOpenTodos, onOpenProjectSummaryList: _onOpenProjectSummaryList, onOpenDashboard, onOpenTimeline: _onOpenTimeline, onOpenWeeklyReport: _onOpenWeeklyReport, onOpenTrash, onOpenHelp, onOpenPricing, onCollapse, onSelectProject, onOpenMasterNote, onRefresh, onDeleted, lang, showToast, todos, masterNotes }: SidebarProps) {
  const [menuState, setMenuState] = useState<{ logId: string; rect: DOMRect } | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [confirmTrashId, setConfirmTrashId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [changingProjectLogId, setChangingProjectLogId] = useState<string | null>(null);
  const changeProjectTrapRef = useFocusTrap<HTMLDivElement>(!!changingProjectLogId);
  const [pinnedOpen, setPinnedOpen] = useState(() => {
    return safeGetItem(SIDEBAR_PINNED_KEY) !== 'closed';
  });

  const togglePinned = () => {
    const next = !pinnedOpen;
    setPinnedOpen(next);
    safeSetItem(SIDEBAR_PINNED_KEY, next ? 'open' : 'closed');
  };
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountPopoverRef = useFocusTrap<HTMLDivElement>(accountMenuOpen);

  // Close account menu on Esc or outside click
  const closeAccountMenu = useCallback(() => setAccountMenuOpen(false), []);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAccountMenu(); };
    const handleClick = (e: MouseEvent) => {
      if (e.target instanceof Node &&
          accountPopoverRef.current && !accountPopoverRef.current.contains(e.target) &&
          accountTriggerRef.current && !accountTriggerRef.current.contains(e.target)) {
        closeAccountMenu();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('keydown', handleKey); document.removeEventListener('mousedown', handleClick); };
  }, [accountMenuOpen, closeAccountMenu, accountPopoverRef]);

  const stats = useMemo(() => {
    const worklogs = logs.filter((l) => l.outputMode !== 'handoff').length;
    const handoffs = logs.filter((l) => l.outputMode === 'handoff').length;
    const todoPending = todos.filter((td) => !td.done).length;
    const todoDone = todos.filter((td) => td.done).length;
    let totalChars = 0;
    for (const log of logs) {
      for (const items of [log.today, log.decisions, log.todo, log.relatedProjects, log.currentStatus, log.nextActions, log.completed, log.blockers, log.constraints, log.resumeContext]) {
        if (items) for (const item of items) totalChars += item.length;
      }
      if (log.title) totalChars += log.title.length;
    }
    return { total: logs.length, worklogs, handoffs, projects: projects.length, todoPending, todoDone, todoTotal: todoPending + todoDone, totalChars };
  }, [logs, projects, todos]);

  // ── Notification dots (minimal, no numbers) ──
  const dots = useMemo(() => {
    const overdueTodos = todos.some((td) => !td.done && td.dueDate && td.dueDate < new Date().toISOString().slice(0, 10));
    const unassignedLogs = logs.some((l) => l.outputMode === 'handoff' && !l.projectId);
    let staleSummary = false;
    let dismissals: Record<string, number> = {};
    try { dismissals = JSON.parse(safeGetItem(NOTIFICATION_DISMISSALS_KEY) || '{}'); } catch (err) { if (import.meta.env.DEV) console.warn('[Sidebar] dismissals parse:', err); }
    for (const note of masterNotes) {
      const projectHandoffs = logs.filter((l) => l.projectId === note.projectId && l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > note.updatedAt);
      if (projectHandoffs.length === 0) continue;
      const dismissedAt = dismissals[`summary_${note.projectId}`];
      const latestTs = Math.max(...projectHandoffs.map((l) => new Date(l.createdAt).getTime()));
      if (dismissedAt && latestTs <= dismissedAt) continue;
      staleSummary = true;
      break;
    }
    return { overdueTodos, unassignedLogs, staleSummary };
  }, [logs, todos, masterNotes]);

  const pinnedProjects = projects.filter((p) => p.pinned);

  const pinnedLogs = logs.filter((l) => l.pinned);

  const openMenu = (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({ logId, rect });
  };

  const buildMenuItems = (log: LogEntry): MenuItem[] => {
    const items: MenuItem[] = [];

    // Pin / Unpin
    items.push({
      label: log.pinned ? t('ctxUnpin', lang) : t('ctxPin', lang),
      onClick: () => {
        if (!log.pinned && pinnedLogs.length >= MAX_PINNED) {
          showToast?.(t('pinLimitReached', lang), 'error');
          return;
        }
        updateLog(log.id, { pinned: !log.pinned });
        onRefresh();
      },
    });

    // Rename (inline editing)
    items.push({
      label: t('ctxRename', lang),
      onClick: () => {
        setEditingLogId(log.id);
        setEditDraft(log.title);
      },
    });

    // Change project (inline picker)
    items.push({
      label: t('ctxChangeProject', lang),
      onClick: () => {
        setChangingProjectLogId(log.id);
      },
    });

    // Remove from project (only if assigned)
    if (log.projectId) {
      items.push({
        label: t('ctxRemoveFromProject', lang),
        onClick: () => { updateLog(log.id, { projectId: undefined }); onRefresh(); },
      });
    }

    // Delete (with confirmation)
    items.push({
      label: t('moveToTrash', lang),
      danger: true,
      onClick: () => {
        setMenuState(null);
        setConfirmTrashId(log.id);
      },
    });

    return items;
  };

  const menuLog = menuState ? logs.find((l) => l.id === menuState.logId) : null;

  return (
    <nav className="sidebar flex-col h-full" aria-label={t('appName', lang)}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="flex-row justify-between mb-md">
          <button className="sidebar-app-name cursor-pointer" onClick={onNewLog} type="button">{t('appName', lang)}</button>
          <div className="flex gap-xs">
            <button className="toggle-btn" onClick={onCollapse} title={t('hideSidebar', lang)} aria-label={t('ariaHideSidebar', lang)}><Menu size={18} /></button>
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={onNewLog}>
          {t('createHandoff', lang)}
        </button>
      </div>

      {/* Navigation — Tier 1 (Primary) */}
      <div className="sidebar-nav-section">
        <div className="border-top sidebar-nav-divider" />
        <button
          className={`sidebar-nav-item${activeView === 'dashboard' ? ' active' : ''}`}
          onClick={onOpenDashboard}
          title={t('navDashboardTitle', lang)}
          aria-current={activeView === 'dashboard' ? 'page' : undefined}
        >
          <LayoutDashboard size={15} />
          <span>{t('navDashboard', lang)}</span>
        </button>
        <button
          className={`sidebar-nav-item${activeView === 'input' || activeView === 'detail' ? ' active' : ''}`}
          onClick={onNewLog}
          title={t('createHandoff', lang)}
          aria-current={activeView === 'input' ? 'page' : undefined}
        >
          <PenSquare size={15} />
          <span>{t('navInput', lang)}</span>
        </button>
        <button
          className={`sidebar-nav-item${activeView === 'projects' || activeView === 'projecthome' ? ' active' : ''}`}
          onClick={onOpenProjects}
          title={t('navProjectsTitle', lang)}
          aria-current={activeView === 'projects' || activeView === 'projecthome' ? 'page' : undefined}
        >
          <FolderKanban size={15} />
          <span>{t('navProjects', lang)}</span>
        </button>

        {/* Tier 2 (Secondary) */}
        <div className="sidebar-nav-secondary-divider" />
        <button
          className={`sidebar-nav-item sidebar-nav-item-secondary${activeView === 'history' ? ' active' : ''}`}
          onClick={onOpenHistory}
          title={t('navLogsTitle', lang)}
          aria-current={activeView === 'history' ? 'page' : undefined}
        >
          <ScrollText size={15} />
          <span>{t('navLogs', lang)}</span>
          {dots.unassignedLogs && <span className="nav-dot accent" role="status" aria-label={t('dotUnassignedLogs', lang)} title={t('dotUnassignedLogs', lang)} />}
        </button>
        <button
          className={`sidebar-nav-item sidebar-nav-item-secondary${activeView === 'todos' ? ' active' : ''}`}
          onClick={onOpenTodos}
          title={t('navTodoTitle', lang)}
          aria-current={activeView === 'todos' ? 'page' : undefined}
        >
          <CheckSquare size={15} />
          <span>{t('navTodo', lang)}</span>
          {dots.overdueTodos && <span className="nav-dot warning" role="status" aria-label={t('dotOverdueTodos', lang)} title={t('dotOverdueTodos', lang)} />}
        </button>
        {/* Settings & Help accessible via User menu only */}
      </div>

      {/* Pinned section (projects + logs combined) */}
      {(pinnedProjects.length > 0 || pinnedLogs.length > 0) && (
        <div className="flex-col sidebar-pinned-section">
          <div className="border-top sidebar-pinned-divider" />
          <button
            type="button"
            className="flex-row cursor-pointer sidebar-pinned-toggle select-none sidebar-toggle-btn"
            onClick={togglePinned}
            aria-label={t('ariaTogglePinned', lang)}
            aria-expanded={pinnedOpen}
          >
            {pinnedOpen ? <ChevronDown size={12} className="sidebar-chevron-icon" /> : <ChevronRight size={12} className="sidebar-chevron-icon" />}
            <span className="sidebar-section-label">{t('pinned', lang)}</span>
          </button>
          {pinnedOpen && (
            <div className="sidebar-pinned-list">
              {pinnedProjects.map((p) => {
                const pColor = getProjectColor(p.color);
                const mn = masterNotes.find(n => n.projectId === p.id);
                const isStale = mn && isStaleMasterNote(mn.updatedAt);
                const hasUnreflected = mn && logs.some(
                  (l) => l.projectId === p.id && l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > mn.updatedAt,
                );
                const showBadge = isStale && hasUnreflected;
                return (
                  <div
                    key={`pin-proj-${p.id}`}
                    className={`sidebar-item sidebar-project-item${activeProjectId === p.id ? ' active' : ''}`}
                    onClick={() => onSelectProject(p.id)}
                    style={pColor ? { borderLeft: `3px solid ${pColor}`, paddingLeft: 7 } : undefined}
                  >
                    {p.icon ? (
                      <span className="sidebar-project-icon">{p.icon}</span>
                    ) : (
                      <Folder size={16} className="sidebar-folder-icon" />
                    )}
                    <span className="sidebar-item-title">{p.name}</span>
                    {showBadge && (
                      <span
                        className="summary-update-badge"
                        title={t('summaryUpdateBadgeTooltip', lang)}
                      />
                    )}
                    <div className="sidebar-project-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="sidebar-icon-btn"
                        onClick={() => onOpenMasterNote(p.id)}
                        title={t('masterNote', lang)}
                        aria-label={t('ariaMasterNote', lang)}
                      >
                        <FileText size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {pinnedLogs.map((log) => (
                <div
                  key={`pin-log-${log.id}`}
                  className={`sidebar-item sidebar-project-item${log.id === selectedId ? ' active' : ''}`}
                  onClick={() => { if (editingLogId !== log.id) onSelect(log.id); }}
                >
                  <span className={`${log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} sidebar-badge-sm`}>
                    {log.outputMode === 'handoff' ? 'H' : 'W'}
                  </span>
                  {editingLogId === log.id ? (
                    <input
                      className="sidebar-item-title sidebar-inline-edit"
                      value={editDraft}
                      aria-label={t('ariaRenameInput', lang)}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const trimmed = editDraft.trim();
                          if (trimmed && trimmed !== log.title) { updateLog(log.id, { title: trimmed }); onRefresh(); }
                          setEditingLogId(null);
                        } else if (e.key === 'Escape') {
                          setEditingLogId(null);
                        }
                      }}
                      onBlur={() => {
                        const trimmed = editDraft.trim();
                        if (trimmed && trimmed !== log.title) { updateLog(log.id, { title: trimmed }); onRefresh(); }
                        setEditingLogId(null);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="sidebar-item-title">{log.title}</span>
                  )}
                  <div className="sidebar-project-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="sidebar-icon-btn"
                      onClick={(e) => openMenu(log.id, e)}
                      aria-label={t('ariaMenu', lang)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spacer to push account to bottom when no pinned section */}
      {!(pinnedProjects.length > 0 || pinnedLogs.length > 0) && <div className="flex-1" />}

      {/* Account area */}
      <button
        ref={accountTriggerRef}
        className="account-trigger"
        data-open={accountMenuOpen}
        onClick={() => setAccountMenuOpen((v) => !v)}
      >
        <div className="account-avatar"><User size={16} /></div>
        <div className="account-info">
          <span className="account-name">{t('accountMenuUser', lang)}</span>
          <button className="account-plan sidebar-plan-link" onClick={(e) => { e.stopPropagation(); onOpenPricing?.(); }} type="button">
            {isPro() ? <><span className="pro-badge-inline">{t('proBadge', lang)}</span> Pro</> : t('accountMenuPlan', lang)}
          </button>
        </div>
        <ChevronUp size={14} className="account-menu-chevron" />
      </button>

      {/* Account popover */}
      {accountMenuOpen && (() => {
        const rect = accountTriggerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return (
          <div
            ref={accountPopoverRef}
            className="account-popover"
            role="menu"
            aria-label={t('accountMenuUser', lang)}
            style={{ left: rect.left, bottom: window.innerHeight - rect.top + 4, top: 'auto' }}
          >
            <button className="account-popover-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); onOpenSettings(); }}>
              <Settings size={16} />
              <span>{t('accountMenuSettings', lang)}</span>
            </button>
            <button className="account-popover-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); onOpenPricing?.(); }}>
              <CreditCard size={16} />
              <span>{t('navPricing', lang)}</span>
            </button>
            <button className="account-popover-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); setStatsOpen(true); }}>
              <BarChart2 size={16} />
              <span>{t('statsTitle', lang)}</span>
            </button>
            <button className="account-popover-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); onOpenTrash(); }}>
              <Trash2 size={16} />
              <span>{t('accountMenuTrash', lang)}</span>
            </button>
            <div className="account-popover-divider" role="separator" />
            <button className="account-popover-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); onOpenHelp(); }}>
              <HelpCircle size={16} />
              <span>{t('accountMenuHelp', lang)}</span>
            </button>
            <button className="account-popover-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); setFeedbackOpen(true); }}>
              <MessageSquare size={16} />
              <span>{t('accountMenuFeedback', lang)}</span>
            </button>
            {/* Logout button hidden — will be implemented with auth */}
          </div>
        );
      })()}

      {/* Context menu */}
      {menuState && menuLog && (
        <ContextMenu
          items={buildMenuItems(menuLog)}
          anchorRect={menuState.rect}
          onClose={() => setMenuState(null)}
        />
      )}
      {confirmTrashId && (
        <ConfirmDialog
          title={t('deleteConfirm', lang)}
          description={t('deleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { trashLog(confirmTrashId); setConfirmTrashId(null); onRefresh(); onDeleted?.(); }}
          onCancel={() => setConfirmTrashId(null)}
        />
      )}
      {statsOpen && createPortal(
        <StatsModal stats={stats} lang={lang} onClose={() => setStatsOpen(false)} onOpenHistory={onOpenHistory} onOpenProjects={onOpenProjects} onOpenTodos={onOpenTodos} />,
        document.body,
      )}
      {feedbackOpen && createPortal(
        <FeedbackModal lang={lang} onClose={() => setFeedbackOpen(false)} />,
        document.body,
      )}
      {changingProjectLogId && createPortal(
        <div className="modal-overlay" role="presentation" onClick={() => setChangingProjectLogId(null)}>
          <div
            ref={changeProjectTrapRef}
            className="shortcuts-modal modal-narrow"
            role="dialog"
            aria-modal="true"
            aria-label={t('ctxChangeProject', lang)}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-md modal-heading-sm">{t('ctxChangeProject', lang)}</h3>
            <div className="flex-col" style={{ gap: 2 }}>
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="account-popover-item project-picker-item"
                  onClick={() => {
                    updateLog(changingProjectLogId, { projectId: p.id });
                    setChangingProjectLogId(null);
                    onRefresh();
                  }}
                >
                  {p.icon ? <span className="text-md">{p.icon}</span> : <Folder size={14} className="text-muted" />}
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-md text-right">
              <button className="btn modal-close-sm" onClick={() => setChangingProjectLogId(null)}>
                {t('cancel', lang)}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </nav>
  );
}

export default memo(Sidebar);
