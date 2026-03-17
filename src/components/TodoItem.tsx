import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, MoreHorizontal, Star, Edit3, Trash2, Flag, Calendar, ExternalLink, Pin, Check, Undo2, Archive, ArchiveRestore, GripVertical, Clock } from 'lucide-react';
import type { Todo, LogEntry } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { updateTodo } from '../storage';

// ─── Helper functions ───
export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

export function isDueToday(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate === today;
}

export const STALE_DAYS = 3;

export function isStaleTodo(todo: Todo): boolean {
  if (todo.done) return false;
  const created = new Date(todo.createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= STALE_DAYS;
}

export const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function priorityStyles(p?: string): { bg: string; hoverBg: string; border: string } {
  switch (p) {
    case 'high':
      return { bg: 'var(--tint-priority-high)', hoverBg: 'var(--tint-priority-high)', border: 'var(--line-priority-high)' };
    case 'medium':
      return { bg: 'var(--tint-priority-medium)', hoverBg: 'var(--tint-priority-medium)', border: 'var(--line-priority-medium)' };
    case 'low':
      return { bg: 'transparent', hoverBg: 'var(--sidebar-hover)', border: 'var(--line-priority-low)' };
    default:
      return { bg: 'transparent', hoverBg: 'var(--sidebar-hover)', border: 'transparent' };
  }
}

// ─── Action Sheet ───
export function TodoActionSheet({ todo, lang, logTitle, onClose, onAction }: {
  todo: Todo;
  lang: Lang;
  logTitle?: string;
  onClose: () => void;
  onAction: (action: string, value?: string) => void;
}) {
  const [subMenu, setSubMenu] = useState<'priority' | 'due' | 'snooze' | null>(null);
  const [dueValue, setDueValue] = useState(todo.dueDate || '');
  const [now] = useState(() => Math.floor(Date.now() / 60000) * 60000);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const priorityLabel = (p?: string) => {
    const labels: Record<string, string> = {
      high: t('todoPriorityHigh', lang),
      medium: t('todoPriorityMedium', lang),
      low: t('todoPriorityLow', lang),
    };
    return p ? labels[p] || p : t('todoPriorityNone', lang);
  };

  const priorityColor = (p: string) => {
    const colors: Record<string, string> = { high: 'var(--error-text, #ef4444)', medium: 'var(--warning-text, #f59e0b)', low: 'var(--text-muted, #6b7280)' };
    return colors[p] || 'var(--text-muted)';
  };

  if (subMenu === 'priority') {
    return (
      <div className="action-sheet-overlay" role="presentation" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet-handle" />
          <div className="action-sheet-header">
            <div className="action-sheet-header-title">{t('todoChangePriority', lang)}</div>
          </div>
          <div className="action-sheet-group">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                className="action-sheet-item"
                onClick={() => { onAction('priority', p); onClose(); }}
              >
                <span className="action-sheet-icon">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor(p) }} />
                </span>
                <span>{priorityLabel(p)}</span>
                {todo.priority === p && <Check size={16} style={{ marginLeft: 'auto', color: 'var(--accent-text)' }} />}
              </button>
            ))}
            <button
              className="action-sheet-item"
              onClick={() => { onAction('priority', ''); onClose(); }}
            >
              <span className="action-sheet-icon" style={{ color: 'var(--text-placeholder)' }}>—</span>
              <span>{t('todoPriorityNone', lang)}</span>
              {!todo.priority && <Check size={16} style={{ marginLeft: 'auto', color: 'var(--accent-text)' }} />}
            </button>
          </div>
          <button className="action-sheet-cancel" onClick={() => setSubMenu(null)}>
            {t('back', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (subMenu === 'due') {
    return (
      <div className="action-sheet-overlay" role="presentation" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet-handle" />
          <div className="action-sheet-header">
            <div className="action-sheet-header-title">{t('todoChangeDue', lang)}</div>
          </div>
          <div className="action-sheet-group" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="date"
                value={dueValue}
                onChange={(e) => setDueValue(e.target.value)}
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={() => { onAction('due', dueValue); onClose(); }}>
                {t('todoDueSet', lang)}
              </button>
            </div>
            {todo.dueDate && (
              <button
                className="btn"
                style={{ marginTop: 8, fontSize: 13, color: 'var(--error-text)' }}
                onClick={() => { onAction('due', ''); onClose(); }}
              >
                {t('todoDueRemove', lang)}
              </button>
            )}
          </div>
          <button className="action-sheet-cancel" onClick={() => setSubMenu(null)}>
            {t('back', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (subMenu === 'snooze') {
    const snoozeOptions = [
      { label: t('snooze1Day', lang), ms: 1 * 24 * 60 * 60 * 1000 },
      { label: t('snooze3Days', lang), ms: 3 * 24 * 60 * 60 * 1000 },
      { label: t('snooze1Week', lang), ms: 7 * 24 * 60 * 60 * 1000 },
    ];
    return (
      <div className="action-sheet-overlay" role="presentation" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet-handle" />
          <div className="action-sheet-header">
            <div className="action-sheet-header-title">{t('snooze', lang)}</div>
          </div>
          <div className="action-sheet-group">
            {snoozeOptions.map((opt) => (
              <button
                key={opt.ms}
                className="action-sheet-item"
                onClick={() => { onAction('snooze', String(Date.now() + opt.ms)); onClose(); }}
              >
                <span className="action-sheet-icon"><Clock size={18} /></span>
                <span>{opt.label}</span>
              </button>
            ))}
            {todo.snoozedUntil && (
              <button
                className="action-sheet-item"
                onClick={() => { onAction('snooze', '0'); onClose(); }}
              >
                <span className="action-sheet-icon"><Undo2 size={18} /></span>
                <span>{t('cancel', lang)}</span>
              </button>
            )}
          </div>
          <button className="action-sheet-cancel" onClick={() => setSubMenu(null)}>
            {t('back', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="action-sheet-overlay" role="presentation" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet-handle" />
        <div className="action-sheet-header">
          <div className="action-sheet-header-title">{todo.text}</div>
        </div>
        <div className="action-sheet-group">
          <button className="action-sheet-item" onClick={() => { onAction('toggle'); onClose(); }}>
            <span className="action-sheet-icon">
              {todo.done ? <Undo2 size={18} /> : <Check size={18} />}
            </span>
            <span>{todo.done ? t('todoMarkUndone', lang) : t('todoMarkDone', lang)}</span>
          </button>
          <button className="action-sheet-item" onClick={() => { onAction('pin'); onClose(); }}>
            <span className="action-sheet-icon">
              {todo.pinned ? <Pin size={18} /> : <Star size={18} />}
            </span>
            <span>{todo.pinned ? t('todoUnpin', lang) : t('todoPin', lang)}</span>
          </button>
          <div className="action-sheet-divider" />
          <button className="action-sheet-item" onClick={() => setSubMenu('priority')}>
            <span className="action-sheet-icon"><Flag size={18} /></span>
            <span>{t('todoChangePriority', lang)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {priorityLabel(todo.priority)}
            </span>
          </button>
          <button className="action-sheet-item" onClick={() => setSubMenu('due')}>
            <span className="action-sheet-icon"><Calendar size={18} /></span>
            <span>{t('todoChangeDue', lang)}</span>
            {todo.dueDate && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {todo.dueDate}
              </span>
            )}
          </button>
          <button className="action-sheet-item" onClick={() => setSubMenu('snooze')}>
            <span className="action-sheet-icon"><Clock size={18} /></span>
            <span>{t('snooze', lang)}</span>
            {todo.snoozedUntil && todo.snoozedUntil > now && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {t('snoozed', lang)}
              </span>
            )}
          </button>
          <div className="action-sheet-divider" />
          <button className="action-sheet-item" onClick={() => { onAction('edit'); onClose(); }}>
            <span className="action-sheet-icon"><Edit3 size={18} /></span>
            <span>{t('todoEdit', lang)}</span>
          </button>
          <button className="action-sheet-item" onClick={() => { onAction('archive'); onClose(); }}>
            <span className="action-sheet-icon">
              {todo.archivedAt ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </span>
            <span>{todo.archivedAt ? t('todoUnarchive', lang) : t('todoArchive', lang)}</span>
          </button>
          {todo.logId && logTitle && (
            <button className="action-sheet-item" onClick={() => { onAction('openLog'); onClose(); }}>
              <span className="action-sheet-icon"><ExternalLink size={18} /></span>
              <span>{t('todoOpenSourceLog', lang)}</span>
            </button>
          )}
          <div className="action-sheet-divider" />
          <button className="action-sheet-item danger" onClick={() => { onAction('delete'); onClose(); }}>
            <span className="action-sheet-icon"><Trash2 size={18} /></span>
            <span>{t('moveToTrash', lang)}</span>
          </button>
        </div>
        <button className="action-sheet-cancel" onClick={onClose}>
          {t('cancel', lang)}
        </button>
      </div>
    </div>
  );
}

// ─── Render context for TodoItem ───
export interface TodoRenderContext {
  lang: Lang;
  logMap: Map<string, LogEntry>;
  selectMode: boolean;
  selectedIds: Set<string>;
  dragEnabled: boolean;
  editingTodoId: string | null;
  editDraft: string;
  now: number;
  onToggle: (id: string, done: boolean) => void;
  onToggleSelect: (id: string) => void;
  onSetActionSheetTodo: (todo: Todo) => void;
  onSetEditingTodoId: (id: string | null) => void;
  onSetEditDraft: (draft: string) => void;
  onRefresh: () => void;
  onOpenLog: (id: string) => void;
}

// ─── TodoItem renderer ───
export function renderTodoItem(
  todo: Todo,
  showSource: boolean,
  ctx: TodoRenderContext,
  handleProps?: Record<string, unknown>,
) {
  const {
    lang, logMap, selectMode, selectedIds, dragEnabled, editingTodoId, editDraft, now,
    onToggle, onToggleSelect, onSetActionSheetTodo, onSetEditingTodoId, onSetEditDraft, onRefresh, onOpenLog,
  } = ctx;

  const logTitle = todo.logId ? logMap.get(todo.logId)?.title : undefined;
  const ps = priorityStyles(todo.priority);
  const isSelected = selectedIds.has(todo.id);
  return (
    <div
      key={todo.id}
      className="todo-item"
      role="listitem"
      tabIndex={0}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        background: selectMode && isSelected ? 'var(--sidebar-active)' : ps.bg,
        borderLeft: ps.border !== 'transparent' ? `3px solid ${ps.border}` : '3px solid transparent',
        transition: 'background 0.12s',
        cursor: selectMode ? 'pointer' : undefined,
      }}
      onMouseEnter={(e) => { if (!selectMode) e.currentTarget.style.background = ps.hoverBg; }}
      onMouseLeave={(e) => { if (!selectMode) e.currentTarget.style.background = ps.bg; }}
      onClick={selectMode ? () => onToggleSelect(todo.id) : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (selectMode) { onToggleSelect(todo.id); } else { onToggle(todo.id, todo.done); } }
        if (e.key === ' ') { e.preventDefault(); if (selectMode) { onToggleSelect(todo.id); } else { onToggle(todo.id, todo.done); } }
      }}
    >
      {dragEnabled && handleProps && (
        <div {...handleProps} style={{ flexShrink: 0, marginTop: 2, cursor: todo.done ? 'default' : 'grab', color: 'var(--text-placeholder)', touchAction: 'none', opacity: todo.done ? 0.3 : 1, pointerEvents: todo.done ? 'none' : 'auto' }}>
          <GripVertical size={16} />
        </div>
      )}
      {selectMode ? (
        <div style={{ flexShrink: 0, marginTop: 1, padding: '2px' }}>
          {isSelected
            ? <CheckSquare size={17} style={{ color: 'var(--accent)' }} />
            : <Square size={17} style={{ color: 'var(--text-placeholder)' }} />
          }
        </div>
      ) : (
        <div
          className="check-pop-target"
          onClick={() => onToggle(todo.id, todo.done)}
          style={{ flexShrink: 0, marginTop: 1, cursor: 'pointer', padding: '2px', transition: 'transform 0.15s ease' }}
          role="checkbox"
          aria-checked={todo.done}
          aria-label={todo.text}
          tabIndex={0}
        >
          {todo.done
            ? <CheckSquare size={17} style={{ color: 'var(--success-text)' }} />
            : <Square size={17} style={{ color: 'var(--text-placeholder)' }} />
          }
        </div>
      )}
      {todo.pinned && (
        <Star size={10} fill="var(--warning-dot)" style={{ color: 'var(--warning-dot)', flexShrink: 0, marginTop: 5 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingTodoId === todo.id ? (
          <input
            className="input"
            style={{ fontSize: 14, width: '100%' }}
            value={editDraft}
            onChange={(e) => onSetEditDraft(e.target.value)}
            onBlur={() => { if (editDraft.trim() && editDraft.trim() !== todo.text) { updateTodo(todo.id, { text: editDraft.trim() }); onRefresh(); } onSetEditingTodoId(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { onSetEditingTodoId(null); } }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            maxLength={500}
          />
        ) : (
          <span style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: todo.done || todo.archivedAt ? 'var(--text-subtle)' : 'var(--text-body)',
            textDecoration: todo.done ? 'line-through' : 'none',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}>
            {todo.text}
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          {todo.dueDate && (
            <span style={{
              color: isOverdue(todo.dueDate) && !todo.done ? 'var(--error-text)' : isDueToday(todo.dueDate) ? 'var(--accent-text)' : undefined,
              fontWeight: isOverdue(todo.dueDate) && !todo.done ? 500 : undefined,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {isOverdue(todo.dueDate) && !todo.done ? t('todoOverdue', lang) + ': ' : isDueToday(todo.dueDate) ? t('todoToday', lang) + ': ' : t('todoDueDate', lang) + ': '}
              {todo.dueDate}
              {isOverdue(todo.dueDate) && !todo.done && (
                <span style={{
                  color: 'var(--error-text, #ef4444)',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '0px 5px',
                  borderRadius: 3,
                  lineHeight: '16px',
                }}>
                  {t('todoOverdueBadge', lang)}
                </span>
              )}
            </span>
          )}
          {todo.snoozedUntil && todo.snoozedUntil > now && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: 'var(--tint-priority-medium, #fef3c7)', color: 'var(--warning-text, #b45309)',
            }}>
              <Clock size={10} />
              {t('snoozed', lang)}
            </span>
          )}
          {showSource && todo.logId && logTitle && (
            <button
              className="btn-link"
              style={{ fontSize: 11 }}
              onClick={(e) => { e.stopPropagation(); onOpenLog(todo.logId); }}
            >
              {logTitle}
            </button>
          )}
          {showSource && !todo.logId && (
            <span>{t('todoManual', lang)}</span>
          )}
        </div>
      </div>
      {!selectMode && (
        <div style={{ flexShrink: 0, marginTop: 1 }}>
          <button
            className="action-menu-btn"
            aria-label={t('ariaMenu', lang)}
            onClick={() => onSetActionSheetTodo(todo)}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
