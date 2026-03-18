/**
 * App.test.tsx — Smoke tests for the root App component
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage — use importOriginal to get all exports, then override what we need
vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    loadLogs: () => [],
    loadProjects: () => [],
    loadTodos: () => [],
    loadMasterNotes: () => [],
    getUiLang: () => 'en',
    setUiLang: vi.fn(),
    getTheme: () => 'light',
    setTheme: vi.fn(),
    purgeExpiredTrash: vi.fn(),
    updateLog: vi.fn(),
    getLog: vi.fn(),
    getAutoReportSetting: () => false,
    getLastReportDate: () => Date.now(),
    setLastReportDate: vi.fn(),
    isDemoMode: () => false,
    setDemoMode: vi.fn(),
    getFeatureEnabled: () => true,
    recordActivity: vi.fn(),
    safeGetItem: () => null,
    safeSetItem: vi.fn(),
    safeRemoveItem: vi.fn(),
    getApiKey: () => null,
    getStreak: () => 0,
    getMasterNote: () => null,
    addLog: vi.fn(),
    addTodosFromLog: vi.fn(),
    addTodosFromLogWithMeta: vi.fn(),
    trashLog: vi.fn(),
    restoreLog: vi.fn(),
    duplicateLog: vi.fn(),
    getAiContext: () => null,
    linkLogs: vi.fn(),
    unlinkLogs: vi.fn(),
    updateTodo: vi.fn(),
  };
});

// Mock onboardingState
vi.mock('../onboardingState', () => ({
  isOnboardingDone: vi.fn(() => false),
  markOnboardingDone: vi.fn(),
}));

// Mock sampleData
vi.mock('../sampleData', () => ({
  isSampleSeeded: () => false,
  seedSampleData: vi.fn(),
}));

// Mock sounds (Audio not available in jsdom)
vi.mock('../sounds', () => ({
  playSuccess: vi.fn(),
  playDelete: vi.fn(),
}));

// Mock Sidebar to avoid its complex rendering
vi.mock('../Sidebar', () => ({
  default: () => <nav data-testid="sidebar">Sidebar</nav>,
}));

// Mock Workspace to avoid deep component tree
vi.mock('../Workspace', () => ({
  default: (props: { mode: string }) => <div data-testid="workspace">{props.mode}</div>,
}));

// Mock BottomNav
vi.mock('../BottomNav', () => ({
  default: () => <div data-testid="bottom-nav" />,
}));

// Mock CommandPalette
vi.mock('../CommandPalette', () => ({
  default: () => null,
}));

// Mock Onboarding
vi.mock('../Onboarding', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="onboarding">
      <button onClick={onClose}>Close Onboarding</button>
    </div>
  ),
}));

// Mock FeedbackModal
vi.mock('../FeedbackModal', () => ({
  default: () => null,
}));

// Mock provider
vi.mock('../provider', () => ({
  shouldUseBuiltinApi: () => false,
  getBuiltinUsage: () => ({ used: 0, limit: 100 }),
}));

import App from '../App';
import { isOnboardingDone } from '../onboardingState';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide minimal matchMedia for theme detection
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    // jsdom doesn't have scrollTo
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  });

  it('renders without crashing', () => {
    vi.mocked(isOnboardingDone).mockReturnValue(true);
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('shows landing page for first-time users (no logs, onboarding not done)', async () => {
    vi.mocked(isOnboardingDone).mockReturnValue(false);
    render(<App />);
    expect(await screen.findByText('Your AI forgot everything from yesterday.')).toBeInTheDocument();
  });

  it('shows main UI when onboarding is done', () => {
    vi.mocked(isOnboardingDone).mockReturnValue(true);
    render(<App />);
    // Main content area should be present
    const mains = screen.getAllByRole('main');
    expect(mains.length).toBeGreaterThanOrEqual(1);
  });
});
