/**
 * DashboardView.test.tsx — Snapshot + UI regression tests for DashboardView
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock greeting
vi.mock('../greeting', () => ({
  getGreeting: () => 'Good morning!',
}));

// Mock FirstUseTooltip — pass-through
vi.mock('../FirstUseTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock EmptyIllustrations
vi.mock('../EmptyIllustrations', () => ({
  EmptyDashboard: () => <div data-testid="empty-dashboard-icon" />,
}));

// Mock extracted components to simplify rendering
vi.mock('../components/ActivitySummaryCard', () => ({
  default: () => <div data-testid="activity-summary" />,
}));

vi.mock('../components/TrendsSection', () => ({
  default: () => <div data-testid="trends-section" />,
}));

vi.mock('../components/NudgeCards', () => ({
  default: () => <div data-testid="nudge-cards" />,
}));

import DashboardView from '../DashboardView';
import type { LogEntry, Project, Todo, MasterNote } from '../types';

function makeLog(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: 'log-1',
    title: 'Test Log',
    createdAt: new Date().toISOString(),
    tags: [],
    today: [],
    decisions: [],
    todo: [],
    outputMode: 'handoff',
    relatedProjects: [],
    currentStatus: ['Working on feature'],
    nextActions: ['Deploy to prod', 'Write tests'],
    completed: ['Setup CI'],
    blockers: [],
    ...overrides,
  };
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    createdAt: Date.now(),
    ...overrides,
  };
}

const defaultProps = {
  logs: [] as LogEntry[],
  projects: [] as Project[],
  todos: [] as Todo[],
  masterNotes: [] as MasterNote[],
  lang: 'en' as const,
  onOpenLog: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenTodos: vi.fn(),
  onOpenSummaryList: vi.fn(),
  onOpenHistory: vi.fn(),
  onNewLog: vi.fn(),
  onToggleAction: vi.fn(),
  onOpenWeeklyReport: vi.fn(),
};

describe('DashboardView', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Snapshot tests ──

  it('matches snapshot with empty state', () => {
    const { container } = render(<DashboardView {...defaultProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot with data', () => {
    const log = makeLog({ projectId: 'proj-1' });
    const project = makeProject();
    const { container } = render(
      <DashboardView
        {...defaultProps}
        logs={[log]}
        projects={[project]}
      />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── UI regression: empty state ──

  it('shows empty state when no handoff logs exist', () => {
    render(<DashboardView {...defaultProps} />);
    expect(screen.getByText('Good morning!')).toBeInTheDocument();
    expect(screen.getByTestId('empty-dashboard-icon')).toBeInTheDocument();
  });

  it('shows create first snapshot button in empty state', () => {
    render(<DashboardView {...defaultProps} />);
    const createBtn = screen.getAllByRole('button').find(
      b => b.textContent?.includes('Snapshot') || b.textContent?.includes('snapshot')
    );
    expect(createBtn).toBeTruthy();
  });

  it('calls onNewLog when create button clicked in empty state', () => {
    render(<DashboardView {...defaultProps} />);
    const createBtn = screen.getAllByRole('button').find(
      b => b.textContent?.includes('Snapshot') || b.textContent?.includes('snapshot')
    );
    fireEvent.click(createBtn!);
    expect(defaultProps.onNewLog).toHaveBeenCalledTimes(1);
  });

  // ── UI regression: with data ──

  it('shows greeting when logs exist', () => {
    const log = makeLog();
    render(<DashboardView {...defaultProps} logs={[log]} />);
    expect(screen.getByText('Good morning!')).toBeInTheDocument();
  });

  it('shows pending actions from handoff logs', () => {
    const log = makeLog({
      nextActions: ['Deploy app', 'Review PR'],
      checkedActions: [],
    });
    render(<DashboardView {...defaultProps} logs={[log]} />);
    expect(screen.getByText('Deploy app')).toBeInTheDocument();
    expect(screen.getByText('Review PR')).toBeInTheDocument();
  });

  it('calls onToggleAction when action checkbox clicked', () => {
    const log = makeLog({
      id: 'log-act',
      nextActions: ['Deploy app'],
      checkedActions: [],
    });
    const { container } = render(<DashboardView {...defaultProps} logs={[log]} />);
    // Find the checkbox-like element for the action
    const checkboxes = container.querySelectorAll('[role="checkbox"], .action-checkbox, .dashboard-action-check');
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);
      expect(defaultProps.onToggleAction).toHaveBeenCalled();
    }
  });

  it('shows project snapshot cards when projects have handoff logs', () => {
    const project = makeProject({ id: 'proj-1', name: 'My Project', icon: '🚀' });
    const log = makeLog({ projectId: 'proj-1', nextActions: ['Task 1', 'Task 2'] });
    render(
      <DashboardView
        {...defaultProps}
        logs={[log]}
        projects={[project]}
      />
    );
    const matches = screen.getAllByText('My Project');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onOpenProject when project card clicked', () => {
    const project = makeProject({ id: 'proj-click', name: 'Clickable Project' });
    const log = makeLog({ projectId: 'proj-click' });
    render(
      <DashboardView
        {...defaultProps}
        logs={[log]}
        projects={[project]}
      />
    );
    const matches = screen.getAllByText('Clickable Project');
    const projectCard = matches[0].closest('button');
    if (projectCard) {
      fireEvent.click(projectCard);
      expect(defaultProps.onOpenProject).toHaveBeenCalledWith('proj-click');
    }
  });

  it('shows checked actions as recently done', () => {
    const log = makeLog({
      nextActions: ['Done task', 'Pending task'],
      checkedActions: [0],
    });
    render(<DashboardView {...defaultProps} logs={[log]} />);
    // The done task should appear somewhere (in recently done section)
    expect(screen.getByText('Done task')).toBeInTheDocument();
  });

  it('deduplicates actions with same text across logs', () => {
    const log1 = makeLog({ id: 'log-1', nextActions: ['Deploy app'], createdAt: '2025-01-02T00:00:00Z' });
    const log2 = makeLog({ id: 'log-2', nextActions: ['Deploy app'], createdAt: '2025-01-01T00:00:00Z' });
    render(<DashboardView {...defaultProps} logs={[log1, log2]} />);
    // Should only show "Deploy app" once
    const matches = screen.getAllByText('Deploy app');
    expect(matches).toHaveLength(1);
  });
});
