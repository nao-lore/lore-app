/**
 * DetailView.test.tsx — Smoke tests for the DetailView component
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../storage', () => ({
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
}));

// Mock classify
vi.mock('../classify', () => ({
  saveCorrection: vi.fn(),
}));

// Mock markdown
vi.mock('../markdown', () => ({
  logToMarkdown: () => '# Test',
}));

// Mock sounds
vi.mock('../sounds', () => ({
  playDelete: vi.fn(),
}));

// Mock workload
vi.mock('../workload', () => ({
  analyzeWorkload: vi.fn(),
  WORKLOAD_CONFIG: { high: { label: 'High' }, medium: { label: 'Medium' }, low: { label: 'Low' } },
}));

// Mock integrations
vi.mock('../integrations', () => ({
  isNotionConfigured: () => false,
  isSlackConfigured: () => false,
}));

// Mock utils/dateFormat
vi.mock('../utils/dateFormat', () => ({
  formatDateFull: (d: string) => d,
  formatDateTimeFull: (d: string) => d,
}));

// Mock formatHandoff
vi.mock('../formatHandoff', () => ({
  formatHandoffMarkdown: () => '',
  formatFullAiContext: () => '',
}));

// Mock generateProjectContext
vi.mock('../generateProjectContext', () => ({
  generateProjectContext: () => '',
}));

import DetailView from '../DetailView';
import type { LogEntry, Project } from '../types';

describe('DetailView', () => {
  const sampleLog: LogEntry = {
    id: 'log-1',
    createdAt: '2025-01-15T10:00:00Z',
    title: 'Test Log Entry',
    outputMode: 'handoff',
    today: ['Did some work'],
    decisions: ['Chose option A'],
    todo: ['Finish feature'],
    relatedProjects: [],
    tags: ['test'],
    currentStatus: ['Feature is 50% done'],
    nextActions: ['Complete the UI'],
    completed: ['Setup project'],
    blockers: [],
  };

  const defaultProps = {
    id: 'log-1',
    onDeleted: vi.fn(),
    onOpenLog: vi.fn(),
    onBack: vi.fn(),
    prevView: 'input',
    lang: 'en' as const,
    projects: [] as Project[],
    onRefresh: vi.fn(),
    showToast: vi.fn(),
    onTagFilter: vi.fn(),
    allLogs: [sampleLog],
    onOpenMasterNote: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // clipboard mock
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders log detail when given valid log data', () => {
    render(<DetailView {...defaultProps} />);
    // Title may appear multiple times (heading + breadcrumb etc), so use getAllByText
    const titles = screen.getAllByText('Test Log Entry');
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "not found" when log does not exist', () => {
    render(<DetailView {...defaultProps} id="nonexistent" />);
    expect(screen.getByText('Log not found.')).toBeInTheDocument();
  });
});
