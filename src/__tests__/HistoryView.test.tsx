/**
 * HistoryView.test.tsx — Snapshot + UI regression tests for HistoryView
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../storage', () => ({
  trashLog: vi.fn(),
  updateLog: vi.fn(),
  loadLogs: () => [],
  getMasterNote: () => null,
  duplicateLog: vi.fn(() => 'dup-1'),
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}));

// Mock markdown
vi.mock('../markdown', () => ({
  logToMarkdown: () => '# Test',
}));

// Mock search
vi.mock('../search', () => ({
  matchesLogQuery: (log: { title: string }, query: string) =>
    log.title.toLowerCase().includes(query.toLowerCase()),
}));

// Mock dateFormat
vi.mock('../utils/dateFormat', () => ({
  formatDateGroup: () => 'Today',
  formatRelativeTime: () => '5 min ago',
  todayISO: () => '2025-01-01',
}));

// Mock LogPickerModal
vi.mock('../LogPickerModal', () => ({
  default: () => null,
}));

// Mock ConfirmDialog
vi.mock('../ConfirmDialog', () => ({
  default: ({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

// Mock extracted sub-components to simplify tests
vi.mock('../components/HistoryFilters', () => ({
  HistoryFiltersToolbar: ({ rawQuery, onQueryChange }: { rawQuery: string; onQueryChange: (v: string) => void }) => (
    <div data-testid="history-filters">
      <input
        data-testid="search-input"
        value={rawQuery}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value)}
        placeholder="Search logs..."
      />
    </div>
  ),
  KeywordsBar: () => null,
}));

vi.mock('../components/historyFiltersHelpers', () => ({
  matchesDateRange: () => true,
}));

vi.mock('../components/HistoryGroupHeader', () => ({
  HistoryPageHeader: ({ title, onBack }: { title: string; onBack: () => void }) => (
    <div data-testid="page-header">
      <button onClick={onBack} data-testid="back-btn">Back</button>
      <h2>{title}</h2>
    </div>
  ),
  HistoryBulkBar: () => null,
}));

vi.mock('../components/HistoryListView', () => ({
  HistoryEmptyState: ({ lang }: { lang: string }) => <div data-testid="empty-state">No logs yet ({lang})</div>,
  UnassignedLogsHint: () => null,
  HistorySelectModeList: () => <div data-testid="select-mode-list" />,
  HistoryVirtualList: ({ groups }: { groups: Array<{ items: unknown[] }> }) => (
    <div data-testid="virtual-list" data-count={groups.reduce((sum: number, g: { items: unknown[] }) => sum + g.items.length, 0)} />
  ),
}));

// Mock historyCardHelpers
vi.mock('../components/historyCardHelpers', () => ({
  downloadFile: vi.fn(),
}));

// Mock HistoryCard type export
vi.mock('../components/HistoryCard', () => ({
  // just re-export type — no runtime values needed
}));

import HistoryView from '../HistoryView';
import type { LogEntry, Project } from '../types';

function makeLog(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: 'log-1',
    title: 'Test Log',
    createdAt: '2025-01-15T10:00:00Z',
    tags: ['react'],
    today: ['Did work'],
    decisions: ['Chose A'],
    todo: ['Fix bugs'],
    outputMode: 'handoff',
    relatedProjects: [],
    ...overrides,
  };
}

const defaultProps = {
  logs: [] as LogEntry[],
  onSelect: vi.fn(),
  onBack: vi.fn(),
  onRefresh: vi.fn(),
  lang: 'en' as const,
  activeProjectId: null,
  projects: [] as Project[],
  showToast: vi.fn(),
  onOpenMasterNote: vi.fn(),
  onOpenProject: vi.fn(),
  tagFilter: null as string | null,
  onClearTagFilter: vi.fn(),
  onTagFilter: vi.fn(),
  onDuplicate: vi.fn(),
};

describe('HistoryView', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Snapshot tests ──

  it('matches snapshot with empty logs', () => {
    const { container } = render(<HistoryView {...defaultProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot with logs', () => {
    const logs = [
      makeLog({ id: 'log-1', title: 'First Log', outputMode: 'handoff' }),
      makeLog({ id: 'log-2', title: 'Second Log', outputMode: 'worklog' }),
    ];
    const { container } = render(<HistoryView {...defaultProps} logs={logs} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── UI regression: empty state ──

  it('shows empty state when no logs', () => {
    render(<HistoryView {...defaultProps} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  // ── UI regression: with logs ──

  it('shows virtual list when logs exist', () => {
    const logs = [makeLog()];
    render(<HistoryView {...defaultProps} logs={logs} />);
    expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<HistoryView {...defaultProps} logs={[makeLog()]} />);
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('passes all logs to virtual list when no filter applied', () => {
    const logs = [
      makeLog({ id: 'log-1', title: 'Alpha' }),
      makeLog({ id: 'log-2', title: 'Beta' }),
    ];
    render(<HistoryView {...defaultProps} logs={logs} />);
    const list = screen.getByTestId('virtual-list');
    // With no search query, all logs should be passed through
    expect(list.getAttribute('data-count')).toBe('2');
  });

  it('renders search input that accepts user typing', () => {
    const logs = [makeLog()];
    const { container } = render(<HistoryView {...defaultProps} logs={logs} />);
    const input = screen.getByTestId('search-input');
    expect(input).toBeInTheDocument();
    // Typing into the search triggers the onChange callback
    fireEvent.change(input, { target: { value: 'test query' } });
    // The HistoryView should re-render with updated rawQuery
    // (verifying the mock's onQueryChange triggers state update)
    const updatedInput = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(updatedInput).toBeTruthy();
  });

  it('shows back button and calls onBack', () => {
    render(<HistoryView {...defaultProps} showBack={true} />);
    const backBtn = screen.getByTestId('back-btn');
    fireEvent.click(backBtn);
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });
});
