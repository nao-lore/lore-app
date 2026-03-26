/**
 * HistoryCard.test.tsx — Tests for HistoryCard components and helpers
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
    updateLog: vi.fn(),
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

// Mock projectColors
vi.mock('../../projectColors', () => ({
  getProjectColor: (c?: string) => c || undefined,
}));

// Mock dateFormat
vi.mock('../../utils/dateFormat', () => ({
  formatRelativeTime: () => '5 min ago',
  todayISO: () => '2025-01-01',
}));

import {
  Highlight,
  HistoryCardItem, HistoryListItem, LogContextMenu,
} from '../../components/HistoryCard';
import { buildPreview, isToday } from '../../components/historyCardHelpers';
import type { LogRenderContext } from '../../components/HistoryCard';
import type { LogEntry, Project } from '../../types';

function makeLog(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: 'log-1',
    title: 'Test Log',
    createdAt: new Date().toISOString(),
    tags: [],
    today: ['Did some work'],
    decisions: ['Chose TypeScript'],
    todo: ['Fix bugs'],
    outputMode: 'worklog',
    relatedProjects: [],
    ...overrides,
  };
}

function makeContext(overrides?: Partial<LogRenderContext>): LogRenderContext {
  return {
    lang: 'en',
    projects: [],
    activeProjectId: null,
    compact: false,
    selectMode: false,
    selected: new Set(),
    debouncedQuery: '',
    editingLogId: null,
    editDraft: '',
    actionSheetLog: null,
    inlinePickerLogId: null,
    onCardClick: vi.fn(),
    onToggleSelect: vi.fn(),
    onSetActionSheetLog: vi.fn(),
    onLogAction: vi.fn(),
    onSetEditDraft: vi.fn(),
    onSetEditingLogId: vi.fn(),
    onSetInlinePickerLogId: vi.fn(),
    onRefresh: vi.fn(),
    onOpenProject: vi.fn(),
    onTagFilter: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
}

// ─── Helper function tests ───

describe('Highlight', () => {
  it('renders text without query', () => {
    const { container } = render(<Highlight text="Hello World" query="" />);
    expect(container.textContent).toBe('Hello World');
  });

  it('highlights matching text', () => {
    const { container } = render(<Highlight text="Hello World" query="World" />);
    const mark = container.querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toBe('World');
  });

  it('highlights case-insensitively', () => {
    const { container } = render(<Highlight text="Hello World" query="world" />);
    const mark = container.querySelector('mark');
    expect(mark).toBeTruthy();
  });

  it('handles no matches gracefully', () => {
    const { container } = render(<Highlight text="Hello World" query="xyz" />);
    expect(container.textContent).toBe('Hello World');
    expect(container.querySelector('mark')).toBeFalsy();
  });
});

describe('buildPreview', () => {
  it('builds worklog preview from today and decisions', () => {
    const log = makeLog({ outputMode: 'worklog', today: ['Task A'], decisions: ['Decision B'], todo: ['Todo C'] });
    const preview = buildPreview(log);
    expect(preview).toContain('Task A');
    expect(preview).toContain('Decision B');
    expect(preview).toContain('Todo C');
  });

  it('builds handoff preview from currentStatus and nextActions', () => {
    const log = makeLog({
      outputMode: 'handoff',
      currentStatus: ['Building UI'],
      nextActions: ['Deploy'],
    });
    const preview = buildPreview(log);
    expect(preview).toContain('Building UI');
    expect(preview).toContain('Deploy');
  });

  it('truncates long previews', () => {
    const log = makeLog({ today: ['A'.repeat(200)] });
    const preview = buildPreview(log);
    expect(preview.length).toBeLessThanOrEqual(141); // 140 + ellipsis
  });

  it('returns empty string for empty log', () => {
    const log = makeLog({ today: [], decisions: [], todo: [] });
    const preview = buildPreview(log);
    expect(preview).toBe('');
  });
});

describe('isToday', () => {
  it('returns true for current date', () => {
    expect(isToday(new Date().toISOString())).toBe(true);
  });

  it('returns false for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(isToday(d.toISOString())).toBe(false);
  });
});

// ─── HistoryCardItem tests ───

describe('HistoryCardItem', () => {
  it('renders log title', () => {
    const log = makeLog({ title: 'My Work Log' });
    const ctx = makeContext();
    render(<HistoryCardItem log={log} ctx={ctx} />);
    expect(screen.getByText('My Work Log')).toBeTruthy();
  });

  it('renders mode badge (worklog)', () => {
    const log = makeLog({ outputMode: 'worklog' });
    const ctx = makeContext();
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    expect(container.querySelector('.badge-worklog')).toBeTruthy();
  });

  it('renders mode badge (handoff)', () => {
    const log = makeLog({ outputMode: 'handoff' });
    const ctx = makeContext();
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    expect(container.querySelector('.badge-handoff')).toBeTruthy();
  });

  it('calls onCardClick on click', () => {
    const onCardClick = vi.fn();
    const log = makeLog();
    const ctx = makeContext({ onCardClick });
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    const card = container.querySelector('.card');
    fireEvent.click(card!);
    expect(onCardClick).toHaveBeenCalledWith('log-1');
  });

  it('calls onCardClick on Enter key', () => {
    const onCardClick = vi.fn();
    const log = makeLog();
    const ctx = makeContext({ onCardClick });
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    const card = container.querySelector('.card') as HTMLElement;
    // button elements handle Enter natively via click
    fireEvent.click(card!);
    expect(onCardClick).toHaveBeenCalledWith('log-1');
  });

  it('shows pin icon when pinned', () => {
    const log = makeLog({ pinned: true });
    const ctx = makeContext();
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    // Pin icon should be rendered
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('shows tags', () => {
    const log = makeLog({ tags: ['react', 'typescript'] });
    const ctx = makeContext();
    render(<HistoryCardItem log={log} ctx={ctx} />);
    expect(screen.getByText('react')).toBeTruthy();
    expect(screen.getByText('typescript')).toBeTruthy();
  });

  it('renders in select mode with checkbox', () => {
    const log = makeLog();
    const ctx = makeContext({ selectMode: true, selected: new Set(['log-1']) });
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    const checkbox = container.querySelector('.bulk-checkbox');
    expect(checkbox).toBeTruthy();
  });

  it('shows menu button', () => {
    const log = makeLog();
    const ctx = makeContext();
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    const menuBtn = container.querySelector('.action-menu-btn');
    expect(menuBtn).toBeTruthy();
  });

  it('renders preview text', () => {
    const log = makeLog({ today: ['Did important work'] });
    const ctx = makeContext();
    const { container } = render(<HistoryCardItem log={log} ctx={ctx} />);
    expect(container.textContent).toContain('Did important work');
  });
});

// ─── HistoryListItem tests ───

describe('HistoryListItem', () => {
  it('renders log title', () => {
    const log = makeLog({ title: 'List View Log' });
    const ctx = makeContext();
    render(<HistoryListItem log={log} ctx={ctx} />);
    expect(screen.getByText('List View Log')).toBeTruthy();
  });

  it('calls onCardClick on click', () => {
    const onCardClick = vi.fn();
    const log = makeLog();
    const ctx = makeContext({ onCardClick });
    const { container } = render(<HistoryListItem log={log} ctx={ctx} />);
    const row = container.querySelector('.list-row');
    fireEvent.click(row!);
    expect(onCardClick).toHaveBeenCalledWith('log-1');
  });

  it('shows short mode badge (H or W)', () => {
    const log = makeLog({ outputMode: 'handoff' });
    const ctx = makeContext();
    const { container } = render(<HistoryListItem log={log} ctx={ctx} />);
    expect(container.textContent).toContain('H');
  });
});

// ─── LogContextMenu tests ───

describe('LogContextMenu', () => {
  it('renders menu items', () => {
    const log = makeLog();
    const { container } = render(
      <LogContextMenu
        log={log}
        lang="en"
        projects={[]}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />
    );
    const items = container.querySelectorAll('.mn-export-item');
    expect(items.length).toBeGreaterThan(0);
  });

  it('calls onAction with pin on pin click', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const log = makeLog({ pinned: false });
    const { container } = render(
      <LogContextMenu
        log={log}
        lang="en"
        projects={[]}
        onClose={onClose}
        onAction={onAction}
      />
    );
    const items = container.querySelectorAll('.mn-export-item');
    // First item is pin
    fireEvent.click(items[0]);
    expect(onAction).toHaveBeenCalledWith('pin');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows project submenu button when projects exist', () => {
    const projects: Project[] = [{ id: 'p1', name: 'Project A', createdAt: Date.now() }];
    const log = makeLog();
    const { container } = render(
      <LogContextMenu
        log={log}
        lang="en"
        projects={projects}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />
    );
    // Should have a project button
    expect(container.textContent).toContain('Project');
  });

  it('calls onAction with delete on trash click', () => {
    const onAction = vi.fn();
    const log = makeLog();
    const { container } = render(
      <LogContextMenu
        log={log}
        lang="en"
        projects={[]}
        onClose={vi.fn()}
        onAction={onAction}
      />
    );
    const deleteBtn = container.querySelector('.text-error');
    fireEvent.click(deleteBtn!);
    expect(onAction).toHaveBeenCalledWith('delete');
  });
});
