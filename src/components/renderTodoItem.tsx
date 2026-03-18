import { CheckSquare, Square, MoreHorizontal, Star, GripVertical, Clock } from 'lucide-react';
import type { Todo } from '../types';
import { t } from '../i18n';
import { updateTodo } from '../storage';
import { isOverdue, isDueToday, priorityStyles } from './todoItemHelpers';
import type { TodoRenderContext } from './TodoItem';
import { SwipeableTodoItem } from './TodoItem';

export function renderTodoItem(
  todo: Todo,
  showSource: boolean,
  ctx: TodoRenderContext,
  handleProps?: Record<string, unknown>,
) {
  const {
    lang, logMap, selectMode, selectedIds, dragEnabled, editingTodoId, editDraft, now,
    onToggle, onToggleSelect, onSetActionSheetTodo, onSetEditingTodoId, onSetEditDraft, onRefresh, onOpenLog,
    onDelete, onToggleDone,
  } = ctx;

  const logTitle = todo.logId ? logMap.get(todo.logId)?.title : undefined;
  const ps = priorityStyles(todo.priority);
  const isSelected = selectedIds.has(todo.id);

  const inner = (
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
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete?.(todo.id); }
      }}
    >
      {dragEnabled && handleProps && (
        <div {...handleProps} className="drag-handle" style={{ cursor: todo.done ? 'default' : 'grab', opacity: todo.done ? 0.3 : 1, pointerEvents: todo.done ? 'none' : 'auto' }}>
          <GripVertical size={16} />
        </div>
      )}
      {selectMode ? (
        <div className="icon-check-wrap">
          {isSelected
            ? <CheckSquare size={17} style={{ color: 'var(--accent)' }} />
            : <Square size={17} className="text-placeholder" />
          }
        </div>
      ) : (
        <div
          className="check-pop-target icon-check-wrap cursor-pointer"
          onClick={() => onToggle(todo.id, todo.done)}
          style={{ transition: 'transform 0.15s ease' }}
          role="checkbox"
          aria-checked={todo.done}
          aria-label={todo.text}
          tabIndex={0}
        >
          {todo.done
            ? <CheckSquare size={17} style={{ color: 'var(--success-text)' }} />
            : <Square size={17} className="text-placeholder" />
          }
        </div>
      )}
      {todo.pinned && (
        <Star size={10} fill="var(--warning-dot)" style={{ color: 'var(--warning-dot)', flexShrink: 0, marginTop: 5 }} />
      )}
      <div className="flex-1">
        {editingTodoId === todo.id ? (
          <input
            className="input w-full fs-14"
            aria-label={t('ariaRenameInput', lang)}
            value={editDraft}
            onChange={(e) => onSetEditDraft(e.target.value)}
            onBlur={() => { if (editDraft.trim() && editDraft.trim() !== todo.text) { updateTodo(todo.id, { text: editDraft.trim() }); onRefresh(); } onSetEditingTodoId(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { onSetEditingTodoId(null); } }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            maxLength={500}
          />
        ) : (
          <span className="todo-text" style={{
            color: todo.done || todo.archivedAt ? 'var(--text-subtle)' : 'var(--text-body)',
            textDecoration: todo.done ? 'line-through' : 'none',
          }}>
            {todo.text}
          </span>
        )}
        <div className="todo-meta-row">
          {todo.dueDate && (
            <span className="inline-flex-center" style={{
              color: isOverdue(todo.dueDate) && !todo.done ? 'var(--error-text)' : isDueToday(todo.dueDate) ? 'var(--accent-text)' : undefined,
              fontWeight: isOverdue(todo.dueDate) && !todo.done ? 500 : undefined,
              gap: 4,
            }}>
              {isOverdue(todo.dueDate) && !todo.done ? t('todoOverdue', lang) + ': ' : isDueToday(todo.dueDate) ? t('todoToday', lang) + ': ' : t('todoDueDate', lang) + ': '}
              {todo.dueDate}
              {isOverdue(todo.dueDate) && !todo.done && (
                <span className="overdue-badge">
                  {t('todoOverdueBadge', lang)}
                </span>
              )}
            </span>
          )}
          {todo.snoozedUntil && todo.snoozedUntil > now && (
            <span className="snooze-badge">
              <Clock size={10} />
              {t('snoozed', lang)}
            </span>
          )}
          {showSource && todo.logId && logTitle && (
            <button
              className="btn-link fs-11"
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
        <div className="shrink-0 mt-1">
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

  return (
    <SwipeableTodoItem
      key={todo.id}
      todo={todo}
      lang={lang}
      selectMode={selectMode}
      onDelete={onDelete}
      onToggleDone={onToggleDone}
    >
      {inner}
    </SwipeableTodoItem>
  );
}
