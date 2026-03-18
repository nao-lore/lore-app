/**
 * TodoItem.test.tsx — Tests for TodoItem component and helpers
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../../storage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    updateTodo: vi.fn(),
    loadLogs: () => [],
    loadProjects: () => [],
    loadTodos: () => [],
    loadMasterNotes: () => [],
    getUiLang: () => 'en',
    getTheme: () => 'light',
    safeGetItem: () => null,
    safeSetItem: vi.fn(),
    safeRemoveItem: vi.fn(),
    getFeatureEnabled: () => true,
    isDemoMode: () => false,
    getApiKey: () => null,
    getLang: () => 'en',
  };
});

import {
  TodoActionSheet,
} from '../../components/TodoItem';
import type { TodoRenderContext } from '../../components/TodoItem';
import {
  isOverdue, isDueToday, isStaleTodo, STALE_DAYS,
  priorityStyles, PRIORITY_ORDER,
} from '../../components/todoItemHelpers';
import { renderTodoItem } from '../../components/renderTodoItem';
import type { Todo } from '../../types';

function makeTodo(overrides?: Partial<Todo>): Todo {
  return {
    id: 'todo-1',
    text: 'Test todo item',
    done: false,
    logId: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeRenderContext(overrides?: Partial<TodoRenderContext>): TodoRenderContext {
  return {
    lang: 'en',
    logMap: new Map(),
    selectMode: false,
    selectedIds: new Set(),
    dragEnabled: false,
    editingTodoId: null,
    editDraft: '',
    now: Date.now(),
    onToggle: vi.fn(),
    onToggleSelect: vi.fn(),
    onSetActionSheetTodo: vi.fn(),
    onSetEditingTodoId: vi.fn(),
    onSetEditDraft: vi.fn(),
    onRefresh: vi.fn(),
    onOpenLog: vi.fn(),
    onDelete: vi.fn(),
    onToggleDone: vi.fn(),
    ...overrides,
  };
}

// ─── Helper function tests ───

describe('isOverdue', () => {
  it('returns false when no dueDate', () => {
    expect(isOverdue()).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });

  it('returns true for past dates', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('returns false for future dates', () => {
    expect(isOverdue('2099-12-31')).toBe(false);
  });
});

describe('isDueToday', () => {
  it('returns false when no dueDate', () => {
    expect(isDueToday()).toBe(false);
  });

  it('returns true for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isDueToday(today)).toBe(true);
  });

  it('returns false for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(isDueToday(d.toISOString().slice(0, 10))).toBe(false);
  });
});

describe('isStaleTodo', () => {
  it('returns false for done todos', () => {
    const todo = makeTodo({ done: true, createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000 });
    expect(isStaleTodo(todo)).toBe(false);
  });

  it('returns true for old undone todos', () => {
    const todo = makeTodo({ done: false, createdAt: Date.now() - (STALE_DAYS + 1) * 24 * 60 * 60 * 1000 });
    expect(isStaleTodo(todo)).toBe(true);
  });

  it('returns false for recent undone todos', () => {
    const todo = makeTodo({ done: false, createdAt: Date.now() });
    expect(isStaleTodo(todo)).toBe(false);
  });
});

describe('priorityStyles', () => {
  it('returns high priority styles', () => {
    const s = priorityStyles('high');
    expect(s.border).toContain('priority-high');
  });

  it('returns medium priority styles', () => {
    const s = priorityStyles('medium');
    expect(s.border).toContain('priority-medium');
  });

  it('returns low priority styles', () => {
    const s = priorityStyles('low');
    expect(s.border).toContain('priority-low');
  });

  it('returns transparent for undefined priority', () => {
    const s = priorityStyles(undefined);
    expect(s.border).toBe('transparent');
  });
});

describe('PRIORITY_ORDER', () => {
  it('has correct ordering: high < medium < low', () => {
    expect(PRIORITY_ORDER.high).toBeLessThan(PRIORITY_ORDER.medium);
    expect(PRIORITY_ORDER.medium).toBeLessThan(PRIORITY_ORDER.low);
  });
});

// ─── Component render tests ───

describe('renderTodoItem', () => {
  it('renders todo text', () => {
    const todo = makeTodo({ text: 'Buy groceries' });
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    expect(container.textContent).toContain('Buy groceries');
  });

  it('renders checkbox in unchecked state', () => {
    const todo = makeTodo({ done: false });
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    const checkbox = container.querySelector('[role="checkbox"]');
    expect(checkbox).toBeTruthy();
    expect(checkbox?.getAttribute('aria-checked')).toBe('false');
  });

  it('renders checkbox in checked state', () => {
    const todo = makeTodo({ done: true });
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    const checkbox = container.querySelector('[role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
  });

  it('calls onToggle when checkbox clicked', () => {
    const onToggle = vi.fn();
    const todo = makeTodo({ done: false });
    const ctx = makeRenderContext({ onToggle });
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    const checkbox = container.querySelector('[role="checkbox"]');
    fireEvent.click(checkbox!);
    expect(onToggle).toHaveBeenCalledWith('todo-1', false);
  });

  it('shows pinned star when todo is pinned', () => {
    const todo = makeTodo({ pinned: true });
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    // Star icon rendered as SVG
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('shows menu button', () => {
    const todo = makeTodo();
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    const menuBtn = container.querySelector('.action-menu-btn');
    expect(menuBtn).toBeTruthy();
  });

  it('calls onSetActionSheetTodo on menu click', () => {
    const onSetActionSheetTodo = vi.fn();
    const todo = makeTodo();
    const ctx = makeRenderContext({ onSetActionSheetTodo });
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    const menuBtn = container.querySelector('.action-menu-btn');
    fireEvent.click(menuBtn!);
    expect(onSetActionSheetTodo).toHaveBeenCalledWith(todo);
  });

  it('shows due date when present', () => {
    const todo = makeTodo({ dueDate: '2099-01-01' });
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    expect(container.textContent).toContain('2099-01-01');
  });

  it('shows overdue badge for past due todos', () => {
    const todo = makeTodo({ dueDate: '2020-01-01' });
    const ctx = makeRenderContext();
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    expect(container.querySelector('.overdue-badge')).toBeTruthy();
  });

  it('shows source log link when showSource is true', () => {
    const logMap = new Map([['log-1', { id: 'log-1', title: 'Source Log' } as never]]);
    const todo = makeTodo({ logId: 'log-1' });
    const ctx = makeRenderContext({ logMap: logMap as never });
    const { container } = render(<div>{renderTodoItem(todo, true, ctx)}</div>);
    expect(container.textContent).toContain('Source Log');
  });

  it('renders in select mode with checkbox icon', () => {
    const todo = makeTodo();
    const ctx = makeRenderContext({ selectMode: true, selectedIds: new Set(['todo-1']) });
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    // In select mode, clicking toggles selection
    const item = container.querySelector('[role="listitem"]');
    expect(item).toBeTruthy();
  });

  it('handles Enter key to toggle', () => {
    const onToggle = vi.fn();
    const todo = makeTodo();
    const ctx = makeRenderContext({ onToggle });
    const { container } = render(<div>{renderTodoItem(todo, false, ctx)}</div>);
    const item = container.querySelector('[role="listitem"]');
    fireEvent.keyDown(item!, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalled();
  });
});

// ─── TodoActionSheet tests ───

describe('TodoActionSheet', () => {
  it('renders todo text as title', () => {
    const todo = makeTodo({ text: 'My Task' });
    render(
      <TodoActionSheet
        todo={todo}
        lang="en"
        onClose={vi.fn()}
        onAction={vi.fn()}
      />
    );
    expect(screen.getByText('My Task')).toBeTruthy();
  });

  it('calls onAction with toggle on mark done click', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const todo = makeTodo({ done: false });
    const { container } = render(
      <TodoActionSheet
        todo={todo}
        lang="en"
        onClose={onClose}
        onAction={onAction}
      />
    );
    // First action-sheet-item is the toggle button
    const items = container.querySelectorAll('.action-sheet-item');
    fireEvent.click(items[0]);
    expect(onAction).toHaveBeenCalledWith('toggle');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', () => {
    const onClose = vi.fn();
    const todo = makeTodo();
    const { container } = render(
      <TodoActionSheet
        todo={todo}
        lang="en"
        onClose={onClose}
        onAction={vi.fn()}
      />
    );
    const overlay = container.querySelector('.action-sheet-overlay');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    const todo = makeTodo();
    render(
      <TodoActionSheet
        todo={todo}
        lang="en"
        onClose={onClose}
        onAction={vi.fn()}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows cancel button', () => {
    const todo = makeTodo();
    const { container } = render(
      <TodoActionSheet
        todo={todo}
        lang="en"
        onClose={vi.fn()}
        onAction={vi.fn()}
      />
    );
    const cancelBtn = container.querySelector('.action-sheet-cancel');
    expect(cancelBtn).toBeTruthy();
  });
});
