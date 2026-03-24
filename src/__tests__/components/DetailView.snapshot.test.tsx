/**
 * DetailView.snapshot.test.tsx — Snapshot + additional UI regression tests for DetailView
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../../storage', () => ({
  trashLog: vi.fn(),
  restoreLog: vi.fn(),
  updateLog: vi.fn(),
  loadTodos: () => [],
  loadLogs: () => [],
  duplicateLog: vi.fn(),
  getAiContext: () => null,
  getMasterNote: () => null,
  getFeatureEnabled: () => false,
  linkLogs: vi.fn(),
  unlinkLogs: vi.fn(),
  updateTodo: vi.fn(),
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}));

// Mock classify
vi.mock('../../classify', () => ({
  saveCorrection: vi.fn(),
}));

// Mock markdown
vi.mock('../../markdown', () => ({
  logToMarkdown: () => '# Test Markdown',
}));

// Mock sounds
vi.mock('../../sounds', () => ({
  playDelete: vi.fn(),
}));

// Mock workload
vi.mock('../../workload', () => ({
  analyzeWorkload: vi.fn(),
  WORKLOAD_CONFIG: { high: { label: 'High' }, medium: { label: 'Medium' }, low: { label: 'Low' } },
}));

// Mock integrations
vi.mock('../../integrations', () => ({
  isNotionConfigured: () => Promise.resolve(false),
  isSlackConfigured: () => Promise.resolve(false),
}));

// Mock dateFormat
vi.mock('../../utils/dateFormat', () => ({
  formatDateFull: (d: string) => d,
  formatDateTimeFull: (d: string) => d,
}));

// Mock formatHandoff
vi.mock('../../formatHandoff', () => ({
  formatHandoffMarkdown: () => '# Formatted Handoff',
  formatFullAiContext: () => 'AI Context',
}));

// Mock generateProjectContext
vi.mock('../../generateProjectContext', () => ({
  generateProjectContext: () => 'Project Context',
}));

import DetailView from '../../DetailView';
import type { LogEntry, Project } from '../../types';

const sampleHandoffLog: LogEntry = {
  id: 'log-handoff',
  createdAt: '2025-01-15T10:00:00Z',
  title: 'Feature Implementation',
  outputMode: 'handoff',
  today: [],
  decisions: [],
  todo: [],
  relatedProjects: [],
  tags: ['react', 'typescript'],
  currentStatus: ['UI component built', 'API integration pending'],
  nextActions: ['Connect to backend', 'Add tests'],
  completed: ['Setup project structure', 'Design review'],
  blockers: ['Waiting for API docs'],
  projectId: 'proj-1',
};

const sampleWorklogLog: LogEntry = {
  id: 'log-worklog',
  createdAt: '2025-01-14T09:00:00Z',
  title: 'Daily Work Log',
  outputMode: 'worklog',
  today: ['Fixed 3 bugs', 'Reviewed PRs'],
  decisions: ['Use TypeScript for new module'],
  todo: ['Write integration tests'],
  relatedProjects: [],
  tags: ['bugfix'],
};

const defaultProps = {
  id: 'log-handoff',
  onDeleted: vi.fn(),
  onOpenLog: vi.fn(),
  onBack: vi.fn(),
  prevView: 'input',
  lang: 'en' as const,
  projects: [{ id: 'proj-1', name: 'My Project', createdAt: Date.now() }] as Project[],
  onRefresh: vi.fn(),
  showToast: vi.fn(),
  onTagFilter: vi.fn(),
  allLogs: [sampleHandoffLog, sampleWorklogLog],
  onOpenMasterNote: vi.fn(),
};

describe('DetailView — snapshots', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('matches snapshot for handoff log', () => {
    const { container } = render(<DetailView {...defaultProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot for worklog', () => {
    const { container } = render(
      <DetailView {...defaultProps} id="log-worklog" allLogs={[sampleWorklogLog]} />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot for not-found log', () => {
    const { container } = render(
      <DetailView {...defaultProps} id="nonexistent" />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('DetailView — UI regression', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the log title', () => {
    render(<DetailView {...defaultProps} />);
    const titles = screen.getAllByText('Feature Implementation');
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it('shows tags on the detail view', () => {
    render(<DetailView {...defaultProps} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  it('clicking a tag calls onTagFilter', () => {
    render(<DetailView {...defaultProps} />);
    fireEvent.click(screen.getByText('react'));
    expect(defaultProps.onTagFilter).toHaveBeenCalledWith('react');
  });

  it('shows current status for handoff logs', () => {
    render(<DetailView {...defaultProps} />);
    expect(screen.getByText('UI component built')).toBeInTheDocument();
    expect(screen.getByText('API integration pending')).toBeInTheDocument();
  });

  it('shows next actions for handoff logs', () => {
    render(<DetailView {...defaultProps} />);
    expect(screen.getByText('Connect to backend')).toBeInTheDocument();
    expect(screen.getByText('Add tests')).toBeInTheDocument();
  });

  it('shows completed items for handoff logs', () => {
    render(<DetailView {...defaultProps} />);
    expect(screen.getByText('Setup project structure')).toBeInTheDocument();
  });

  it('shows blockers for handoff logs', () => {
    render(<DetailView {...defaultProps} />);
    expect(screen.getByText('Waiting for API docs')).toBeInTheDocument();
  });

  it('shows "not found" for nonexistent log', () => {
    render(<DetailView {...defaultProps} id="nonexistent" />);
    expect(screen.getByText('Log not found.')).toBeInTheDocument();
  });

  it('shows worklog fields (today, decisions) for worklog type', () => {
    render(<DetailView {...defaultProps} id="log-worklog" allLogs={[sampleWorklogLog]} />);
    expect(screen.getByText('Fixed 3 bugs')).toBeInTheDocument();
    expect(screen.getByText('Use TypeScript for new module')).toBeInTheDocument();
  });
});
