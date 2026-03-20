import { useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, Archive } from 'lucide-react';
import type { Todo, LogEntry } from '../types';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { EmptyTodos } from '../EmptyIllustrations';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderTodos } from '../storage';
import { renderTodoItem } from './renderTodoItem';
import type { TodoRenderContext } from './TodoItem';

// ─── Sortable wrapper ───
function SortableTodoItem({ id, disabled, children }: { id: string; disabled: boolean; children: (props: { handleProps: Record<string, unknown>; style: React.CSSProperties }) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.15)' : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ handleProps: { ...attributes, ...listeners }, style })}
    </div>
  );
}

// ─── Group section ───

interface TodoGroupedEntry {
  key: string;
  label: string;
  items: Todo[];
}

interface TodoGroupedViewProps {
  groups: TodoGroupedEntry[];
  groupKey: string;
  showSourcePerItem: boolean;
  todoCtx: TodoRenderContext;
  logMap: Map<string, LogEntry>;
  onOpenLog: (id: string) => void;
  lang: Lang;
}

const TodoGroupedView = memo(function TodoGroupedView({
  groups, groupKey, showSourcePerItem, todoCtx, logMap, onOpenLog, lang,
}: TodoGroupedViewProps) {
  return (
    <div className="group-container">
      {groups.map((group) => (
        <div key={group.key} className="content-card">
          {group.label && (
            <div className="group-header">
              <span className="group-label">
                {group.label}
              </span>
              <span className="meta text-xs-muted" style={{ marginLeft: 8 }}>
                {group.items.length}
              </span>
              {groupKey === 'source' && group.key !== '_manual' && (() => {
                const log = logMap.get(group.key);
                return log ? (
                  <button
                    className="btn-link text-xs-muted" style={{ marginLeft: 8 }}
                    onClick={() => onOpenLog(group.key)}
                  >
                    {t('todoFromLog', lang)} →
                  </button>
                ) : null;
              })()}
            </div>
          )}
          <div role="list" className="todo-list-col">
            {group.items.map((todo) => renderTodoItem(todo, showSourcePerItem, todoCtx))}
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Main list content ───

interface TodoListContentProps {
  sorted: Todo[];
  todoVisibleCount: number;
  dragEnabled: boolean;
  selectMode: boolean;
  groupKey: string;
  activeTab: string;
  addOpen: boolean;
  groups: TodoGroupedEntry[];
  showSourcePerItem: boolean;
  todoCtx: TodoRenderContext;
  logMap: Map<string, LogEntry>;
  onOpenLog: (id: string) => void;
  onOpenAddForm: () => void;
  onRefresh: () => void;
  lang: Lang;
}

export const TodoListContent = memo(function TodoListContent({
  sorted, todoVisibleCount, dragEnabled, groupKey, activeTab,
  addOpen, groups, showSourcePerItem, todoCtx, logMap, onOpenLog, onOpenAddForm, onRefresh, lang,
}: TodoListContentProps) {
  const listParentRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((t) => t.id === active.id);
    const newIndex = sorted.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorderTodos(reordered.map((t) => t.id));
    onRefresh();
  };

  // Virtual scrolling
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: useCallback(() => listParentRef.current, []),
    estimateSize: () => 60,
    overscan: 10,
  });

  if (sorted.length === 0 && !addOpen) {
    return (
      <div className="empty-state">
        {activeTab === 'pending' && <EmptyTodos lang={lang} />}
        {activeTab === 'completed' && <div className="empty-state-icon"><CheckCircle2 size={48} strokeWidth={1.2} color="var(--text-muted)" opacity={0.4} /></div>}
        {activeTab === 'archived' && <div className="empty-state-icon"><Archive size={48} strokeWidth={1.2} color="var(--text-muted)" opacity={0.4} /></div>}
        <p>{activeTab === 'archived' ? t('todoNoArchived', lang) : activeTab === 'completed' ? t('todoNoCompleted', lang) : t('noTodos', lang)}</p>
        {activeTab === 'pending' && <p className="page-subtitle">{t('noTodosDesc', lang)}</p>}
        {activeTab === 'archived' && <p className="page-subtitle">{t('todoNoArchivedDesc', lang)}</p>}
        {activeTab === 'completed' && <p className="page-subtitle">{t('todoNoCompletedDesc', lang)}</p>}
        {activeTab === 'pending' && (
          <button
            className="btn btn-primary mt-md"
            onClick={onOpenAddForm}
          >
            {t('todoAdd', lang)}
          </button>
        )}
      </div>
    );
  }

  if (groupKey !== 'none') {
    return (
      <TodoGroupedView
        groups={groups}
        groupKey={groupKey}
        showSourcePerItem={showSourcePerItem}
        todoCtx={todoCtx}
        logMap={logMap}
        onOpenLog={onOpenLog}
        lang={lang}
      />
    );
  }

  return (
    <div className="content-card">
      {dragEnabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.slice(0, todoVisibleCount).map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div role="list" className="todo-list-col">
              {sorted.slice(0, todoVisibleCount).map((todo) => (
                <SortableTodoItem key={todo.id} id={todo.id} disabled={false}>
                  {({ handleProps }) => renderTodoItem(todo, true, todoCtx, handleProps)}
                </SortableTodoItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div
          ref={listParentRef}
          role="list"
          className="virtual-list-scroll"
        >
          <div className="virtual-list-container w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const todo = sorted[virtualRow.index];
              return (
                <div
                  key={todo.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="virtual-item"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderTodoItem(todo, true, todoCtx)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
