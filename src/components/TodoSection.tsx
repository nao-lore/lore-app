import { CheckSquare, Square } from 'lucide-react';
import { loadTodos } from '../storage';
import { updateTodo as updateTodoStorage } from '../storage';
import type { Todo } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';

// _todosVersion is destructured as a reactive dependency trigger to force re-render on todo changes
function TodoSection({ logId, lang, todosVersion: _todosVersion, onToggle, allTodos }: { logId: string; lang: Lang; todosVersion: number; onToggle: () => void; allTodos?: Todo[] }) {
  const todos = (allTodos ?? loadTodos()).filter((t: Todo) => t.logId === logId);
  if (todos.length === 0) return null;

  const handleToggle = (id: string, done: boolean) => {
    updateTodoStorage(id, { done: !done });
    onToggle();
  };

  return (
    <div className="content-card">
      <div className="content-card-header">{t('sectionTodo', lang)}</div>
      <ul className="list-none">
        {todos.map((todo: Todo) => (
          <li
            key={todo.id}
            onClick={() => handleToggle(todo.id, todo.done)}
            className="todo-section-item"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {todo.done
              ? <CheckSquare size={18} className="shrink-0 mt-1" style={{ color: 'var(--success-text)' }} />
              : <Square size={18} className="shrink-0 mt-1" style={{ color: 'var(--text-placeholder)' }} />
            }
            <span style={{
              color: todo.done ? 'var(--text-placeholder)' : 'var(--text-secondary)',
              textDecoration: todo.done ? 'line-through' : 'none',
            }}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TodoSection;
