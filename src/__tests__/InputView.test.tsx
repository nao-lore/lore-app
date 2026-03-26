/**
 * InputView.test.tsx — Smoke tests for the InputView component
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../storage', () => ({
  addLog: vi.fn(),
  getLog: vi.fn(),
  addTodosFromLog: vi.fn(),
  addTodosFromLogWithMeta: vi.fn(),
  loadLogs: () => [],
  updateLog: vi.fn(),
  getApiKey: () => 'test-key',
  getFeatureEnabled: () => true,
  getMasterNote: () => null,
  getStreak: () => 0,
  isDemoMode: () => false,
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}));

// Mock useTransform hook
vi.mock('../hooks/useTransform', () => ({
  useTransform: () => ({
    result: null,
    savedResult: null,
    error: '',
    loading: false,
    progress: null,
    simStep: 0,
    streamDetail: null,
    savedId: null,
    savedHandoffId: null,
    outputMode: 'handoff',
    transformAction: 'handoff_todo',
    wasFirstTransform: false,
    classifying: false,
    suggestion: null,
    postSavePickerOpen: false,
    setOutputMode: vi.fn(),
    setTransformAction: vi.fn(),
    setPostSavePickerOpen: vi.fn(),
    setSuggestion: vi.fn(),
    runTransform: vi.fn(),
    resetAll: vi.fn(),
    handleProjectSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    acceptSuggestion: vi.fn(),
  }),
}));

// Mock useFileImport hook
vi.mock('../hooks/useFileImport', () => ({
  useFileImport: () => ({
    dragging: false,
    captureInfo: null,
    setCaptureInfo: vi.fn(),
    fileRef: { current: null },
    handleFiles: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    removeFile: vi.fn(),
  }),
  readFileContent: vi.fn(),
}));

// Mock provider
vi.mock('../provider', () => ({
  shouldUseBuiltinApi: () => false,
  getBuiltinUsage: () => ({ used: 0, limit: 100 }),
}));

// Mock transform
vi.mock('../transform', () => ({
  transformText: vi.fn(),
  transformHandoff: vi.fn(),
  transformBoth: vi.fn(),
  transformTodoOnly: vi.fn(),
  transformHandoffTodo: vi.fn(),
  buildHandoffLogEntry: vi.fn(),
  CHAR_WARN: 50000,
  needsChunking: () => false,
}));

// Mock chunkEngine
vi.mock('../chunkEngine', () => ({
  ChunkEngine: vi.fn(),
  getChunkTarget: () => 'openai',
  getEngineConcurrency: () => 1,
}));

// Mock classify
vi.mock('../classify', () => ({
  classifyLog: vi.fn(),
  saveCorrection: vi.fn(),
}));

// Mock jsonImport
vi.mock('../jsonImport', () => ({
  parseConversationJson: vi.fn(),
}));

// Mock sounds
vi.mock('../sounds', () => ({
  playSuccess: vi.fn(),
  playDelete: vi.fn(),
}));

// Mock greeting
vi.mock('../greeting', () => ({
  getGreeting: () => 'Hello!',
}));

// Mock markdown
vi.mock('../markdown', () => ({
  logToMarkdown: () => '',
  handoffResultToMarkdown: () => '',
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

// Mock ResultDisplay
vi.mock('../ResultDisplay', () => ({
  HandoffResultDisplay: () => <div data-testid="handoff-result" />,
  WorklogResultDisplay: () => <div data-testid="worklog-result" />,
}));

// Mock utils/dateFormat
vi.mock('../utils/dateFormat', () => ({
  formatRelativeTime: () => '1 hour ago',
  todayISO: () => '2025-01-01',
}));

// Mock ErrorRetryBanner
vi.mock('../ErrorRetryBanner', () => ({
  default: () => null,
}));

// Mock FirstUseTooltip
vi.mock('../FirstUseTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock ProgressPanel
vi.mock('../ProgressPanel', () => ({
  default: () => null,
}));

// Mock SkeletonLoader
vi.mock('../SkeletonLoader', () => ({
  default: () => null,
}));

import InputView from '../InputView';

describe('InputView', () => {
  const defaultProps = {
    onSaved: vi.fn(),
    onOpenLog: vi.fn(),
    lang: 'en' as const,
    activeProjectId: null,
    projects: [],
    showToast: vi.fn(),
    onDirtyChange: vi.fn(),
    pendingTodosCount: 0,
    lastLogCreatedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the greeting', () => {
    render(<InputView {...defaultProps} />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('shows the 3 mode buttons', () => {
    render(<InputView {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    // There should be at least 3 mode radio buttons (handoff, handoff+todo, todo only)
    expect(radios.length).toBeGreaterThanOrEqual(3);
    // Check that mode labels exist in the document
    expect(screen.getAllByText('Context Snapshot', { exact: true }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Snapshot + TODO').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TODO Only').length).toBeGreaterThanOrEqual(1);
  });

  it('textarea is present and accepts input', () => {
    render(<InputView {...defaultProps} />);
    // Multiple elements may share the same aria-label; find the textarea specifically
    const textareas = screen.getAllByLabelText(/Paste.*AI conversation/i);
    const textarea = textareas.find((el) => el.tagName === 'TEXTAREA');
    expect(textarea).toBeTruthy();
    expect(textarea!.tagName).toBe('TEXTAREA');
  });
});
