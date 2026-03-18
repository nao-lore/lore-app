import React, { useState, useEffect, useCallback, memo } from 'react';
import { Star, Edit3, Trash2, Flag, Calendar, ExternalLink, Pin, Check, Undo2, Archive, ArchiveRestore, Clock } from 'lucide-react';
import type { Todo, LogEntry } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { useSwipeAction } from '../hooks/useSwipeAction';


// ─── Action Sheet ───
export const TodoActionSheet = memo(function TodoActionSheet({ todo, lang, logTitle, onClose, onAction }: {
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
                  <span className="priority-dot" style={{ background: priorityColor(p) }} />
                </span>
                <span>{priorityLabel(p)}</span>
                {todo.priority === p && <Check size={16} className="ml-auto" style={{ color: 'var(--accent-text)' }} />}
              </button>
            ))}
            <button
              className="action-sheet-item"
              onClick={() => { onAction('priority', ''); onClose(); }}
            >
              <span className="action-sheet-icon text-placeholder">—</span>
              <span>{t('todoPriorityNone', lang)}</span>
              {!todo.priority && <Check size={16} className="ml-auto" style={{ color: 'var(--accent-text)' }} />}
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
          <div className="action-sheet-group action-sheet-due-form">
            <div className="action-sheet-due-row">
              <input
                className="input flex-1"
                type="date"
                value={dueValue}
                onChange={(e) => setDueValue(e.target.value)}
                autoFocus
              />
              <button className="btn btn-primary" onClick={() => { onAction('due', dueValue); onClose(); }}>
                {t('todoDueSet', lang)}
              </button>
            </div>
            {todo.dueDate && (
              <button
                className="btn mt-sm"
                style={{ fontSize: 13, color: 'var(--error-text)' }}
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
            <span className="action-meta">
              {priorityLabel(todo.priority)}
            </span>
          </button>
          <button className="action-sheet-item" onClick={() => setSubMenu('due')}>
            <span className="action-sheet-icon"><Calendar size={18} /></span>
            <span>{t('todoChangeDue', lang)}</span>
            {todo.dueDate && (
              <span className="action-meta">
                {todo.dueDate}
              </span>
            )}
          </button>
          <button className="action-sheet-item" onClick={() => setSubMenu('snooze')}>
            <span className="action-sheet-icon"><Clock size={18} /></span>
            <span>{t('snooze', lang)}</span>
            {todo.snoozedUntil && todo.snoozedUntil > now && (
              <span className="action-meta">
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
});

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
  onDelete?: (id: string) => void;
  onToggleDone?: (id: string, done: boolean) => void;
}

// ─── Swipeable wrapper (uses hook) ───
export const SwipeableTodoItem = memo(function SwipeableTodoItem({ todo, lang, selectMode, onDelete, onToggleDone, children }: {
  todo: Todo;
  lang: Lang;
  selectMode: boolean;
  onDelete?: (id: string) => void;
  onToggleDone?: (id: string, done: boolean) => void;
  children: React.ReactNode;
}) {
  const swipe = useSwipeAction({
    onSwipeLeft: !selectMode && onDelete ? () => onDelete(todo.id) : undefined,
    onSwipeRight: !selectMode && onToggleDone ? () => onToggleDone(todo.id, todo.done) : undefined,
    threshold: 100,
    leftLabel: t('moveToTrash', lang),
    rightLabel: t('todoMarkDone', lang),
    leftColor: 'var(--error-bg, #fee2e2)',
    rightColor: 'var(--success-bg, #dcfce7)',
  });

  if (selectMode || (!onDelete && !onToggleDone)) {
    return <>{children}</>;
  }

  return (
    <div className="swipe-action-container" style={swipe.containerStyle} {...swipe.handlers}>
      {swipe.rightBg && <div className="swipe-action-bg swipe-action-bg-right" style={swipe.rightBg.style}>{swipe.rightBg.label}</div>}
      {swipe.leftBg && <div className="swipe-action-bg swipe-action-bg-left" style={swipe.leftBg.style}>{swipe.leftBg.label}</div>}
      <div style={swipe.itemStyle}>
        {children}
      </div>
    </div>
  );
});

