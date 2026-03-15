import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ScrollText, FolderOpen, CheckSquare, MoreHorizontal, Settings, Trash2, HelpCircle, LogOut, ChevronUp, ChevronDown, ChevronRight, BookOpen, Clock, BarChart2, FileBarChart, LayoutDashboard, MessageSquare, Menu } from 'lucide-react';
import type { LogEntry, Project, Todo } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import { updateLog, trashLog, getMasterNote, loadMasterNotes } from './storage';
import ContextMenu from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import FeedbackModal from './FeedbackModal';
import { getProjectColor } from './projectColors';


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
      onClick={onClose}
    >
      <div
        className="shortcuts-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('statsTitle', lang)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid var(--border-divider)',
                cursor: row.onClick ? 'pointer' : undefined,
              }}
              onClick={row.onClick ? () => { onClose(); row.onClick!(); } : undefined}
            >
              <span style={{ fontSize: 14, color: row.indent ? 'var(--text-muted)' : 'var(--text-body)', paddingLeft: row.indent ? 12 : 0 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn" onClick={onClose} style={{ fontSize: 13 }}>
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
}

const MAX_PINNED = 5;

export default function Sidebar({ logs, projects, selectedId, activeProjectId, activeView, onSelect, onNewLog, onOpenSettings, onOpenHistory, onOpenProjects, onOpenTodos, onOpenProjectSummaryList, onOpenDashboard, onOpenTimeline, onOpenWeeklyReport, onOpenTrash, onOpenHelp, onOpenPricing, onCollapse, onSelectProject, onOpenMasterNote, onRefresh, onDeleted, lang, showToast, todos }: SidebarProps) {
  const [menuState, setMenuState] = useState<{ logId: string; rect: DOMRect } | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [confirmTrashId, setConfirmTrashId] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(() => {
    try { return localStorage.getItem('threadlog_sidebar_pinned') !== 'closed'; } catch { return true; }
  });

  const togglePinned = () => {
    const next = !pinnedOpen;
    setPinnedOpen(next);
    try { localStorage.setItem('threadlog_sidebar_pinned', next ? 'open' : 'closed'); } catch { /* ignore */ }
  };
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountPopoverRef = useRef<HTMLDivElement>(null);

  // Close account menu on Esc or outside click
  const closeAccountMenu = useCallback(() => setAccountMenuOpen(false), []);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAccountMenu(); };
    const handleClick = (e: MouseEvent) => {
      if (accountPopoverRef.current && !accountPopoverRef.current.contains(e.target as Node) &&
          accountTriggerRef.current && !accountTriggerRef.current.contains(e.target as Node)) {
        closeAccountMenu();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('keydown', handleKey); document.removeEventListener('mousedown', handleClick); };
  }, [accountMenuOpen, closeAccountMenu]);

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
    const allNotes = loadMasterNotes();
    let staleSummary = false;
    let dismissals: Record<string, number> = {};
    try { dismissals = JSON.parse(localStorage.getItem('threadlog_notification_dismissals') || '{}'); } catch { /* ignore */ }
    for (const note of allNotes) {
      const projectHandoffs = logs.filter((l) => l.projectId === note.projectId && l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > note.updatedAt);
      if (projectHandoffs.length === 0) continue;
      const dismissedAt = dismissals[`summary_${note.projectId}`];
      const latestTs = Math.max(...projectHandoffs.map((l) => new Date(l.createdAt).getTime()));
      if (dismissedAt && latestTs <= dismissedAt) continue;
      staleSummary = true;
      break;
    }
    return { overdueTodos, unassignedLogs, staleSummary };
  }, [logs, todos]);

  const pinnedProjects = projects.filter((p) => p.pinned);

  const pinnedLogs = logs.filter((l) => l.pinned);

  const openMenu = (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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

    // Rename
    items.push({
      label: t('ctxRename', lang),
      onClick: () => {
        const newName = prompt(t('ctxRenamePrompt', lang), log.title);
        if (newName && newName.trim() && newName.trim() !== log.title) {
          updateLog(log.id, { title: newName.trim() });
          onRefresh();
        }
      },
    });

    // Change project
    items.push({
      label: t('ctxChangeProject', lang),
      onClick: () => {
        const choice = prompt(
          projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n') + '\n\n' + t('ctxChangeProjectPrompt', lang),
          ''
        );
        if (choice) {
          const idx = parseInt(choice, 10) - 1;
          if (idx >= 0 && idx < projects.length) {
            updateLog(log.id, { projectId: projects[idx].id });
            onRefresh();
          } else {
            // Try matching by name
            const match = projects.find((p) => p.name.toLowerCase() === choice.toLowerCase());
            if (match) {
              updateLog(log.id, { projectId: match.id });
              onRefresh();
            }
          }
        }
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
    <nav className="sidebar" aria-label={t('appName', lang)} style={{ width: 260, minWidth: 260, height: '100%', borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', background: 'var(--bg-sidebar)' }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span onClick={onNewLog} style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.3px', cursor: 'pointer' }}>{t('appName', lang)}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="toggle-btn" onClick={onCollapse} title={t('hideSidebar', lang)} aria-label={t('ariaHideSidebar', lang)}><Menu size={18} /></button>
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNewLog} style={{ width: '100%', marginBottom: 0 }}>
          {t('newLog', lang)}
        </button>
      </div>

      {/* Navigation — Home + Views */}
      <div style={{ padding: '4px 10px 0' }}>
        <div style={{ borderTop: '1px solid var(--border-default)', margin: '0 4px 4px', paddingTop: 8 }} />
        <button
          className={`sidebar-nav-item${activeView === 'input' ? ' active' : ''}`}
          onClick={onNewLog}
          title={t('navHomeTitle', lang)}
        >
          <LayoutDashboard size={15} />
          <span>{t('navHome', lang)}</span>
        </button>
        <button
          className={`sidebar-nav-item${activeView === 'dashboard' ? ' active' : ''}`}
          onClick={onOpenDashboard}
          title={t('navDashboardTitle', lang)}
        >
          <BarChart2 size={15} />
          <span>{t('navDashboard', lang)}</span>
        </button>
        <button
          className={`sidebar-nav-item${activeView === 'todos' ? ' active' : ''}`}
          onClick={onOpenTodos}
          title={t('navTodoTitle', lang)}
        >
          <CheckSquare size={15} />
          <span>{t('navTodo', lang)}</span>
          {dots.overdueTodos && <span className="nav-dot warning" />}
        </button>
        <button
          className={`sidebar-nav-item${activeView === 'timeline' ? ' active' : ''}`}
          onClick={onOpenTimeline}
          title={t('navTimelineTitle', lang)}
        >
          <Clock size={15} />
          <span>{t('navTimeline', lang)}</span>
        </button>
        {onOpenWeeklyReport && (
          <button
            className={`sidebar-nav-item${activeView === 'weeklyreport' ? ' active' : ''}`}
            onClick={onOpenWeeklyReport}
            title={t('navWeeklyReportTitle', lang)}
          >
            <FileBarChart size={15} />
            <span>{t('navWeeklyReport', lang)}</span>
          </button>
        )}
      </div>

      {/* Navigation — Workflow (Logs → Projects → Summaries) */}
      <div style={{ padding: '4px 10px 0' }}>
        <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 4px 4px' }} />
        <div style={{ padding: '0 4px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-placeholder)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {t('navWorkflow', lang)}
        </div>
        <button
          className={`sidebar-nav-item${activeView === 'history' ? ' active' : ''}`}
          onClick={onOpenHistory}
          title={t('navLogsTitle', lang)}
        >
          <ScrollText size={15} />
          <span>{t('navLogs', lang)}</span>
          {dots.unassignedLogs && <span className="nav-dot accent" />}
        </button>
        <div style={{ paddingLeft: 18, lineHeight: 1, marginBottom: 1 }}>
          <ChevronDown size={11} style={{ color: 'var(--accent)', opacity: 0.5 }} />
        </div>
        <button
          className={`sidebar-nav-item${activeView === 'projects' || activeView === 'projecthome' ? ' active' : ''}`}
          onClick={onOpenProjects}
          title={t('navProjectsTitle', lang)}
        >
          <FolderOpen size={15} />
          <span>{t('navProjects', lang)}</span>
        </button>
        <div style={{ paddingLeft: 18, lineHeight: 1, marginBottom: 1 }}>
          <ChevronDown size={11} style={{ color: 'var(--accent)', opacity: 0.5 }} />
        </div>
        <button
          className={`sidebar-nav-item${activeView === 'summarylist' || activeView === 'masternote' ? ' active' : ''}`}
          onClick={onOpenProjectSummaryList}
          title={t('navProjectSummaryTitle', lang)}
        >
          <BookOpen size={15} />
          <span>{t('navProjectSummary', lang)}</span>
          {dots.staleSummary && <span className="nav-dot warning" />}
        </button>
      </div>

      {/* Pinned section (projects + logs combined) */}
      {(pinnedProjects.length > 0 || pinnedLogs.length > 0) && (
        <div style={{ padding: '4px 10px 0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 4px 8px' }} />
          <div
            style={{ padding: '0 4px', marginBottom: 4, display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            onClick={togglePinned}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePinned(); } }}
          >
            {pinnedOpen ? <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 4 }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 4 }} />}
            <span className="sidebar-section-label">{t('pinned', lang)}</span>
          </div>
          {pinnedOpen && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {pinnedProjects.map((p) => {
                const pColor = getProjectColor(p.color);
                const mn = getMasterNote(p.id);
                const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
                const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
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
                      <span style={{ fontSize: 14, flexShrink: 0, marginRight: 4, lineHeight: 1 }}>{p.icon}</span>
                    ) : (
                      <span style={{ fontSize: 12, flexShrink: 0, marginRight: 4 }}>📁</span>
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
                  onClick={() => onSelect(log.id)}
                >
                  <span className={log.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', minWidth: 16, textAlign: 'center' }}>
                    {log.outputMode === 'handoff' ? 'H' : 'W'}
                  </span>
                  <span className="sidebar-item-title">{log.title}</span>
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
      {!(pinnedProjects.length > 0 || pinnedLogs.length > 0) && <div style={{ flex: 1 }} />}

      {/* Account area */}
      <button
        ref={accountTriggerRef}
        className="account-trigger"
        data-open={accountMenuOpen}
        onClick={() => setAccountMenuOpen((v) => !v)}
      >
        <div className="account-avatar">U</div>
        <div className="account-info">
          <span className="account-name">{t('accountMenuUser', lang)}</span>
          <span className="account-plan" onClick={(e) => { e.stopPropagation(); onOpenPricing?.(); }} style={{ cursor: 'pointer' }}>{t('accountMenuPlan', lang)}</span>
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
            style={{ left: rect.left, bottom: window.innerHeight - rect.top + 4, top: 'auto' }}
          >
            <button className="account-popover-item" onClick={() => { setAccountMenuOpen(false); onOpenSettings(); }}>
              <Settings size={16} />
              <span>{t('accountMenuSettings', lang)}</span>
            </button>
            <button className="account-popover-item" onClick={() => { setAccountMenuOpen(false); setStatsOpen(true); }}>
              <BarChart2 size={16} />
              <span>{t('statsTitle', lang)}</span>
            </button>
            <button className="account-popover-item" onClick={() => { setAccountMenuOpen(false); onOpenTrash(); }}>
              <Trash2 size={16} />
              <span>{t('accountMenuTrash', lang)}</span>
            </button>
            <div className="account-popover-divider" />
            <button className="account-popover-item" onClick={() => { setAccountMenuOpen(false); onOpenHelp(); }}>
              <HelpCircle size={16} />
              <span>{t('accountMenuHelp', lang)}</span>
            </button>
            <button className="account-popover-item" onClick={() => { setAccountMenuOpen(false); setFeedbackOpen(true); }}>
              <MessageSquare size={16} />
              <span>{t('accountMenuFeedback', lang)}</span>
            </button>
            <div className="account-popover-divider" />
            <button className="account-popover-item danger" onClick={() => { setAccountMenuOpen(false); }}>
              <LogOut size={16} />
              <span>{t('accountMenuLogout', lang)}</span>
            </button>
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
    </nav>
  );
}
