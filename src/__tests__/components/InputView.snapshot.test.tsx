/**
 * InputView.snapshot.test.tsx — Snapshot + additional UI regression tests for InputView
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock storage
vi.mock('../../storage', () => ({
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
const mockRunTransform = vi.fn();
const mockResetAll = vi.fn();
const mockSetOutputMode = vi.fn();
const mockSetTransformAction = vi.fn();

vi.mock('../../hooks/useTransform', () => ({
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
    setOutputMode: mockSetOutputMode,
    setTransformAction: mockSetTransformAction,
    setPostSavePickerOpen: vi.fn(),
    setSuggestion: vi.fn(),
    runTransform: mockRunTransform,
    resetAll: mockResetAll,
    handleProjectSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    acceptSuggestion: vi.fn(),
  }),
}));

// Mock useFileImport hook
vi.mock('../../hooks/useFileImport', () => ({
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
vi.mock('../../provider', () => ({
  shouldUseBuiltinApi: () => false,
  getBuiltinUsage: () => ({ used: 0, limit: 100 }),
}));

// Mock transform
vi.mock('../../transform', () => ({
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
vi.mock('../../chunkEngine', () => ({
  ChunkEngine: vi.fn(),
  getChunkTarget: () => 'openai',
  getEngineConcurrency: () => 1,
}));

// Mock classify
vi.mock('../../classify', () => ({
  classifyLog: vi.fn(),
  saveCorrection: vi.fn(),
}));

// Mock jsonImport
vi.mock('../../jsonImport', () => ({
  parseConversationJson: vi.fn(),
}));

// Mock sounds
vi.mock('../../sounds', () => ({
  playSuccess: vi.fn(),
  playDelete: vi.fn(),
}));

// Mock greeting
vi.mock('../../greeting', () => ({
  getGreeting: () => 'Good morning!',
}));

// Mock markdown
vi.mock('../../markdown', () => ({
  logToMarkdown: () => '',
  handoffResultToMarkdown: () => '',
}));

// Mock formatHandoff
vi.mock('../../formatHandoff', () => ({
  formatHandoffMarkdown: () => '',
  formatFullAiContext: () => '',
}));

// Mock generateProjectContext
vi.mock('../../generateProjectContext', () => ({
  generateProjectContext: () => '',
}));

// Mock ResultDisplay
vi.mock('../../ResultDisplay', () => ({
  HandoffResultDisplay: () => <div data-testid="handoff-result" />,
  WorklogResultDisplay: () => <div data-testid="worklog-result" />,
}));

// Mock utils/dateFormat
vi.mock('../../utils/dateFormat', () => ({
  formatRelativeTime: () => '1 hour ago',
}));

// Mock ErrorRetryBanner
vi.mock('../../ErrorRetryBanner', () => ({
  default: () => null,
}));

// Mock FirstUseTooltip
vi.mock('../../FirstUseTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock ProgressPanel
vi.mock('../../ProgressPanel', () => ({
  default: () => null,
}));

// Mock SkeletonLoader
vi.mock('../../SkeletonLoader', () => ({
  default: () => null,
}));

import InputView from '../../InputView';

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

describe('InputView — snapshots', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot in default state', () => {
    const { container } = render(<InputView {...defaultProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot with active project', () => {
    const { container } = render(
      <InputView
        {...defaultProps}
        activeProjectId="proj-1"
        projects={[{ id: 'proj-1', name: 'My Project', createdAt: Date.now() }]}
      />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('InputView — UI regression', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders mode selector with 3 radio buttons', () => {
    render(<InputView {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(3);
  });

  it('mode buttons show correct labels', () => {
    render(<InputView {...defaultProps} />);
    expect(screen.getAllByText('Context Snapshot', { exact: true }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Snapshot + TODO').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TODO Only').length).toBeGreaterThanOrEqual(1);
  });

  it('renders textarea for conversation input', () => {
    render(<InputView {...defaultProps} />);
    const textareas = screen.getAllByLabelText(/Paste.*AI conversation/i);
    const textarea = textareas.find((el) => el.tagName === 'TEXTAREA');
    expect(textarea).toBeTruthy();
  });

  it('textarea accepts text input', () => {
    render(<InputView {...defaultProps} />);
    const textareas = screen.getAllByLabelText(/Paste.*AI conversation/i);
    const textarea = textareas.find((el) => el.tagName === 'TEXTAREA') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    expect(textarea.value).toBe('Hello world');
  });

  it('calls onDirtyChange when text entered', () => {
    render(<InputView {...defaultProps} />);
    const textareas = screen.getAllByLabelText(/Paste.*AI conversation/i);
    const textarea = textareas.find((el) => el.tagName === 'TEXTAREA') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Some text' } });
    expect(defaultProps.onDirtyChange).toHaveBeenCalled();
  });

  it('shows greeting text', () => {
    render(<InputView {...defaultProps} />);
    expect(screen.getByText('Good morning!')).toBeInTheDocument();
  });
});
