import { CheckSquare, Square } from 'lucide-react';
import { loadTodos } from '../storage';
import { updateTodo as updateTodoStorage } from '../storage';
import type { Todo } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map((todo: Todo) => (
          <li
            key={todo.id}
            onClick={() => handleToggle(todo.id, todo.done)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s', margin: '0 -6px' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {todo.done
              ? <CheckSquare size={18} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 1 }} />
              : <Square size={18} style={{ color: 'var(--text-placeholder)', flexShrink: 0, marginTop: 1 }} />
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
