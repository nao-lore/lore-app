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

  it('renders 7 nav items in two tiers', () => {
    render(<Sidebar {...defaultProps} />);
    // Tier 1 (3): Dashboard, Input, Projects
    // Tier 2 (4): Logs, TODO, Settings, Help
    const navItems = screen.getAllByRole('button').filter(
      (btn) => btn.classList.contains('sidebar-nav-item')
    );
    expect(navItems.length).toBe(7);
  });

  it('shows tier 2 secondary nav items', () => {
    const { container } = render(<Sidebar {...defaultProps} />);
    // Secondary items should be visible (no toggle needed)
    const secondaryItems = container.querySelectorAll('.sidebar-nav-item-secondary');
    expect(secondaryItems.length).toBe(4);
  });

  it('shows pinned section when pinned items exist', () => {
    const propsWithPinned = {
      ...defaultProps,
      projects: [{ id: 'p1', name: 'Pinned Project', createdAt: Date.now(), pinned: true }],
    };
    render(<Sidebar {...propsWithPinned} />);
    // Pinned toggle should exist
    const pinnedToggle = screen.getByLabelText('Toggle pinned section');
    expect(pinnedToggle).toBeInTheDocument();
    expect(screen.getByText('Pinned Project')).toBeInTheDocument();
  });
});
