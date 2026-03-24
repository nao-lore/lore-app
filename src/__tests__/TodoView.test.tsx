/**
 * TodoView.test.tsx — Snapshot + UI regression tests for TodoView
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../storage', () => ({
  loadTodos: vi.fn(() => []),
  loadArchivedTodos: vi.fn(() => []),
  updateTodo: vi.fn(),
  addManualTodo: vi.fn(),
  trashTodo: vi.fn(),
  trashCompletedTodos: vi.fn(),
  archiveTodo: vi.fn(),
  unarchiveTodo: vi.fn(),
  bulkUpdateTodos: vi.fn(),
  bulkTrashTodos: vi.fn(),
  snoozeTodo: vi.fn(),
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}));

// Mock sounds
vi.mock('../sounds', () => ({
  playComplete: vi.fn(),
}));

// Mock dateFormat
vi.mock('../utils/dateFormat', () => ({
  formatDateGroup: () => 'Today',
}));

// Mock ConfirmDialog
vi.mock('../ConfirmDialog', () => ({
  default: ({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <button data-testid="confirm-btn" onClick={onConfirm}>Confirm</button>
      <button data-testid="cancel-btn" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

// Mock TodoItem components
vi.mock('../components/TodoItem', () => ({
  TodoActionSheet: ({ todo, onClose, onAction }: { todo: { text: string }; onClose: () => void; onAction: (a: string) => void }) => (
    <div data-testid="action-sheet">
      <span>{todo.text}</span>
      <button data-testid="action-toggle" onClick={() => onAction('toggle')}>Toggle</button>
      <button data-testid="action-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

// Mock todoItemHelpers
vi.mock('../components/todoItemHelpers', () => ({
  isStaleTodo: () => false,
  isOverdue: () => false,
  isDueToday: () => false,
  PRIORITY_ORDER: { high: 0, medium: 1, low: 2 },
  STALE_DAYS: 7,
}));

// Mock TodoToolbar
vi.mock('../components/TodoToolbar', () => ({
  TodoTabs: ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) => (
    <div data-testid="todo-tabs">
      <button data-testid="tab-pending" className={activeTab === 'pending' ? 'active' : ''} onClick={() => onTabChange('pending')}>Pending</button>
      <button data-testid="tab-completed" className={activeTab === 'completed' ? 'active' : ''} onClick={() => onTabChange('completed')}>Completed</button>
      <button data-testid="tab-archived" className={activeTab === 'archived' ? 'active' : ''} onClick={() => onTabChange('archived')}>Archived</button>
    </div>
  ),
  DueFilterBar: () => <div data-testid="due-filter-bar" />,
  ProgressSummary: () => <div data-testid="progress-summary" />,
  BulkActionBar: ({ selectMode }: { selectMode: boolean }) => selectMode ? <div data-testid="bulk-bar" /> : null,
  TodoHeaderActions: ({ onAdd, onStartSelect }: { onAdd: () => void; onStartSelect: () => void }) => (
    <div data-testid="header-actions">
      <button data-testid="add-todo-btn" onClick={onAdd}>Add</button>
      <button data-testid="select-btn" onClick={onStartSelect}>Select</button>
    </div>
  ),
}));

// Mock TodoListContent
vi.mock('../components/TodoListContent', () => ({
  TodoListContent: ({ sorted }: { sorted: unknown[] }) => (
    <div data-testid="todo-list" data-count={sorted.length} />
  ),
}));

// Mock TodoHeader
vi.mock('../components/TodoHeader', () => ({
  StaleBanner: () => null,
  StaleFilterIndicator: () => null,
  TodoInlineAddForm: ({ onAdd, onClose }: { onAdd: (text: string, priority: string, due: string) => void; onClose: () => void }) => (
    <div data-testid="add-form">
      <input data-testid="add-input" />
      <button data-testid="add-submit" onClick={() => onAdd('New task', '', '')}>Submit</button>
      <button data-testid="add-cancel" onClick={onClose}>Cancel</button>
    </div>
  ),
}));

import TodoView from '../TodoView';
import { loadTodos } from '../storage';
import type { LogEntry, Todo } from '../types';

function makeTodo(overrides?: Partial<Todo>): Todo {
  return {
    id: 'todo-1',
    text: 'Test todo',
    done: false,
    logId: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

const defaultProps = {
  logs: [] as LogEntry[],
  onBack: vi.fn(),
  onOpenLog: vi.fn(),
  lang: 'en' as const,
  showToast: vi.fn(),
};

describe('TodoView', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadTodos).mockReturnValue([]);
  });

  // ── Snapshot tests ──

  it('matches snapshot with empty todos', () => {
    const { container } = render(<TodoView {...defaultProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot with todos', () => {
    vi.mocked(loadTodos).mockReturnValue([
      makeTodo({ id: 't1', text: 'Buy groceries', done: false }),
      makeTodo({ id: 't2', text: 'Write tests', done: true }),
    ]);
    const { container } = render(<TodoView {...defaultProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── UI regression tests ──

  it('renders the todo heading', () => {
    render(<TodoView {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
  });

  it('shows back button and calls onBack', () => {
    render(<TodoView {...defaultProps} />);
    const backBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('←'));
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn!);
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows tab buttons (pending, completed, archived)', () => {
    render(<TodoView {...defaultProps} />);
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument();
    expect(screen.getByTestId('tab-completed')).toBeInTheDocument();
    expect(screen.getByTestId('tab-archived')).toBeInTheDocument();
  });

  it('shows todo list content area', () => {
    render(<TodoView {...defaultProps} />);
    expect(screen.getByTestId('todo-list')).toBeInTheDocument();
  });

  it('shows correct pending/completed counts', () => {
    vi.mocked(loadTodos).mockReturnValue([
      makeTodo({ id: 't1', done: false }),
      makeTodo({ id: 't2', done: false }),
      makeTodo({ id: 't3', done: true }),
    ]);
    render(<TodoView {...defaultProps} />);
    // The subtitle shows counts
    const subtitleText = screen.getByText(/2.*·.*1/);
    expect(subtitleText).toBeInTheDocument();
  });

  it('shows add button and opens inline add form when clicked', () => {
    render(<TodoView {...defaultProps} />);
    const addBtn = screen.getByTestId('add-todo-btn');
    fireEvent.click(addBtn);
    expect(screen.getByTestId('add-form')).toBeInTheDocument();
  });

  it('shows due filter bar for pending tab', () => {
    render(<TodoView {...defaultProps} />);
    expect(screen.getByTestId('due-filter-bar')).toBeInTheDocument();
  });

  it('shows progress summary for pending tab', () => {
    render(<TodoView {...defaultProps} />);
    expect(screen.getByTestId('progress-summary')).toBeInTheDocument();
  });

  it('hides due filter bar on completed tab', () => {
    render(<TodoView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-completed'));
    expect(screen.queryByTestId('due-filter-bar')).not.toBeInTheDocument();
  });
});
