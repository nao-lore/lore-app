/**
 * Sidebar.test.tsx — Smoke tests for the Sidebar component
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../storage', () => ({
  updateLog: vi.fn(),
  trashLog: vi.fn(),
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}));

// Mock projectColors
vi.mock('../projectColors', () => ({
  getProjectColor: () => null,
}));

import Sidebar from '../Sidebar';

describe('Sidebar', () => {
  const defaultProps = {
    logs: [],
    projects: [],
    todos: [],
    masterNotes: [],
    selectedId: null,
    activeProjectId: null,
    activeView: 'input',
    onSelect: vi.fn(),
    onNewLog: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenProjects: vi.fn(),
    onOpenTodos: vi.fn(),
    onOpenProjectSummaryList: vi.fn(),
    onOpenDashboard: vi.fn(),
    onOpenTimeline: vi.fn(),
    onOpenWeeklyReport: vi.fn(),
    onOpenTrash: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenPricing: vi.fn(),
    onCollapse: vi.fn(),
    onHide: vi.fn(),
    onSelectProject: vi.fn(),
    onOpenMasterNote: vi.fn(),
    onRefresh: vi.fn(),
    onDeleted: vi.fn(),
    lang: 'en' as const,
    showToast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 5 primary nav items', () => {
    render(<Sidebar {...defaultProps} />);
    // The 5 primary nav items: Home, Dashboard, Logs, Projects, TODO
    const navItems = screen.getAllByRole('button').filter(
      (btn) => btn.classList.contains('sidebar-nav-item')
    );
    expect(navItems.length).toBe(5);
  });

  it('shows "More" section that can be toggled', () => {
    render(<Sidebar {...defaultProps} />);
    // "More" toggle exists — it uses aria-label="More" and aria-expanded
    const moreToggles = screen.getAllByRole('button', { name: 'More' });
    const moreToggle = moreToggles[0];
    expect(moreToggle).toBeInTheDocument();
    expect(moreToggle).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(moreToggle);
    expect(moreToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows pinned section when pinned items exist', () => {
    const propsWithPinned = {
      ...defaultProps,
      projects: [{ id: 'p1', name: 'Pinned Project', createdAt: Date.now(), pinned: true }],
    };
    render(<Sidebar {...propsWithPinned} />);
    // Pinned toggle should exist
    const pinnedToggle = screen.getByLabelText('Pinned');
    expect(pinnedToggle).toBeInTheDocument();
    expect(screen.getByText('Pinned Project')).toBeInTheDocument();
  });
});
