/**
 * DetailHeader.test.tsx — Tests for the DetailHeader component
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../../storage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    loadLogs: () => [],
    updateLog: vi.fn(),
    getFeatureEnabled: () => true,
    safeGetItem: () => null,
    safeSetItem: vi.fn(),
    safeRemoveItem: vi.fn(),
    getUiLang: () => 'en',
    getTheme: () => 'light',
    isDemoMode: () => false,
    getApiKey: () => null,
    getLang: () => 'en',
    loadProjects: () => [],
    loadTodos: () => [],
    loadMasterNotes: () => [],
  };
});

// Mock dateFormat
vi.mock('../../utils/dateFormat', () => ({
  formatDateTimeFull: () => '2025-01-01 12:00',
}));

// Mock workload
vi.mock('../../workload', () => ({
  WORKLOAD_CONFIG: {
    high: { color: 'red', bg: '#fee', label: () => 'High' },
    medium: { color: 'orange', bg: '#fff3cd', label: () => 'Medium' },
    low: { color: 'green', bg: '#d4edda', label: () => 'Low' },
  },
}));

import DetailHeader from '../../components/DetailHeader';
import type { LogEntry, Project } from '../../types';

function makeLog(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: 'log-1',
    title: 'Test Snapshot',
    createdAt: '2025-01-01T00:00:00Z',
    tags: [],
    today: [],
    decisions: [],
    todo: [],
    outputMode: 'handoff',
    relatedProjects: [],
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
  log: makeLog(),
  project: undefined as Project | undefined,
  isHandoff: true,
  lang: 'en' as const,
  editingTitle: false,
  titleDraft: '',
  setTitleDraft: vi.fn(),
  setEditingTitle: vi.fn(),
  onTitleSave: vi.fn(),
  onTitleCancel: vi.fn(),
  showSaved: false,
  analyzingWorkload: false,
  onAnalyzeWorkload: vi.fn(),
  onCopyWithContext: vi.fn(),
  onMenuToggle: vi.fn(),
  menuOpen: false,
  menuContent: undefined,
  onBack: vi.fn(),
  onRefresh: vi.fn(),
  showToast: vi.fn(),
  onOpenMasterNote: vi.fn(),
};

describe('DetailHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the log title in h2', () => {
    const { container } = render(<DetailHeader {...defaultProps} />);
    const title = container.querySelector('.detail-title');
    expect(title?.textContent).toBe('Test Snapshot');
  });

  it('renders breadcrumb with Logs link', () => {
    const { container } = render(<DetailHeader {...defaultProps} />);
    const breadcrumb = container.querySelector('.detail-breadcrumb');
    expect(breadcrumb?.textContent).toContain('Logs');
  });

  it('calls onBack when breadcrumb Logs is clicked', () => {
    const onBack = vi.fn();
    const { container } = render(<DetailHeader {...defaultProps} onBack={onBack} />);
    const logsLink = container.querySelector('.detail-breadcrumb [role="button"]') as HTMLElement;
    fireEvent.click(logsLink);
    expect(onBack).toHaveBeenCalled();
  });

  it('calls onBack when Logs breadcrumb gets Enter key', () => {
    const onBack = vi.fn();
    const { container } = render(<DetailHeader {...defaultProps} onBack={onBack} />);
    const logsLink = container.querySelector('.detail-breadcrumb [role="button"]') as HTMLElement;
    fireEvent.keyDown(logsLink, { key: 'Enter' });
    expect(onBack).toHaveBeenCalled();
  });

  it('shows handoff badge when isHandoff', () => {
    const { container } = render(<DetailHeader {...defaultProps} isHandoff={true} />);
    expect(container.querySelector('.badge-handoff')).toBeTruthy();
  });

  it('shows worklog badge when not handoff', () => {
    const { container } = render(<DetailHeader {...defaultProps} isHandoff={false} />);
    expect(container.querySelector('.badge-worklog')).toBeTruthy();
  });

  it('shows project name in breadcrumb when project provided', () => {
    const project = makeProject({ name: 'My Project' });
    const { container } = render(<DetailHeader {...defaultProps} project={project} />);
    expect(container.textContent).toContain('My Project');
  });

  it('calls onOpenMasterNote when project breadcrumb clicked', () => {
    const onOpenMasterNote = vi.fn();
    const project = makeProject({ id: 'proj-1' });
    const { container } = render(<DetailHeader {...defaultProps} project={project} onOpenMasterNote={onOpenMasterNote} />);
    // The project link in breadcrumb
    const breadcrumbSpans = container.querySelectorAll('.detail-breadcrumb .text-muted');
    const projSpan = Array.from(breadcrumbSpans).find(s => s.textContent?.includes('Test Project'));
    if (projSpan) fireEvent.click(projSpan);
    expect(onOpenMasterNote).toHaveBeenCalledWith('proj-1');
  });

  it('enters title edit mode on click', () => {
    const setEditingTitle = vi.fn();
    const setTitleDraft = vi.fn();
    const { container } = render(
      <DetailHeader
        {...defaultProps}
        setEditingTitle={setEditingTitle}
        setTitleDraft={setTitleDraft}
      />
    );
    const titleEl = container.querySelector('.detail-title')!;
    fireEvent.click(titleEl);
    expect(setEditingTitle).toHaveBeenCalledWith(true);
    expect(setTitleDraft).toHaveBeenCalledWith('Test Snapshot');
  });

  it('shows title input in edit mode', () => {
    const { container } = render(
      <DetailHeader
        {...defaultProps}
        editingTitle={true}
        titleDraft="Editing..."
      />
    );
    const input = container.querySelector('.detail-title-input');
    expect(input).toBeTruthy();
  });

  it('calls onTitleSave on Enter in title input', () => {
    const onTitleSave = vi.fn();
    const { container } = render(
      <DetailHeader
        {...defaultProps}
        editingTitle={true}
        titleDraft="New Title"
        onTitleSave={onTitleSave}
      />
    );
    const input = container.querySelector('.detail-title-input')!;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onTitleSave).toHaveBeenCalled();
  });

  it('calls onTitleCancel on Escape in title input', () => {
    const onTitleCancel = vi.fn();
    const { container } = render(
      <DetailHeader
        {...defaultProps}
        editingTitle={true}
        titleDraft="Editing"
        onTitleCancel={onTitleCancel}
      />
    );
    const input = container.querySelector('.detail-title-input')!;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onTitleCancel).toHaveBeenCalled();
  });

  it('shows saved indicator when showSaved is true', () => {
    const { container } = render(
      <DetailHeader {...defaultProps} showSaved={true} />
    );
    expect(container.querySelector('.detail-saved-indicator')).toBeTruthy();
  });

  it('renders pin button', () => {
    const { container } = render(<DetailHeader {...defaultProps} />);
    const pinBtn = container.querySelector('.detail-pin-btn');
    expect(pinBtn).toBeTruthy();
  });

  it('shows AI context copy button for handoff with project', () => {
    const project = makeProject();
    const { container } = render(
      <DetailHeader
        {...defaultProps}
        isHandoff={true}
        project={project}
        log={makeLog({ projectId: 'proj-1' })}
      />
    );
    const copyBtn = container.querySelector('.detail-ai-copy-btn');
    expect(copyBtn).toBeTruthy();
  });

  it('calls onCopyWithContext when AI copy button clicked', () => {
    const onCopyWithContext = vi.fn();
    const project = makeProject();
    const { container } = render(
      <DetailHeader
        {...defaultProps}
        isHandoff={true}
        project={project}
        log={makeLog({ projectId: 'proj-1' })}
        onCopyWithContext={onCopyWithContext}
      />
    );
    const copyBtn = container.querySelector('.detail-ai-copy-btn');
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn!);
    expect(onCopyWithContext).toHaveBeenCalled();
  });

  it('calls onMenuToggle when menu button clicked', () => {
    const onMenuToggle = vi.fn();
    const { container } = render(
      <DetailHeader {...defaultProps} onMenuToggle={onMenuToggle} />
    );
    const menuBtn = container.querySelector('[data-menu-trigger="detail"]');
    fireEvent.click(menuBtn!);
    expect(onMenuToggle).toHaveBeenCalled();
  });

  it('renders menu content when provided', () => {
    render(
      <DetailHeader
        {...defaultProps}
        menuContent={<div data-testid="menu-content">Menu Here</div>}
      />
    );
    expect(screen.getByTestId('menu-content')).toBeTruthy();
  });
});
