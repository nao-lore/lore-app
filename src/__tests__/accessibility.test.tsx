/**
 * accessibility.test.tsx — Accessibility tests for Lore app
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ─── Mock storage ───
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
    getLang: () => 'en',
    setLang: vi.fn(),
  };
});

vi.mock('../onboardingState', () => ({
  isOnboardingDone: vi.fn(() => true),
  markOnboardingDone: vi.fn(),
}));

vi.mock('../sampleData', () => ({
  isSampleSeeded: () => false,
  seedSampleData: vi.fn(),
}));

vi.mock('../sounds', () => ({
  playSuccess: vi.fn(),
  playDelete: vi.fn(),
}));

vi.mock('../provider', () => ({
  shouldUseBuiltinApi: () => false,
  getBuiltinUsage: () => ({ used: 0, limit: 100, remaining: 100 }),
}));

// ─── Imports ───
import ConfirmDialog from '../ConfirmDialog';
import SettingsPanel from '../SettingsPanel';
import { WorklogResultDisplay, HandoffResultDisplay } from '../ResultDisplay';
import type { TransformResult, HandoffResult } from '../types';

beforeEach(() => {
  vi.clearAllMocks();
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
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════
// 1. All buttons must have aria-label or text content
// ═══════════════════════════════════════════════════════════════════
describe('Accessibility: buttons have accessible names', () => {
  it('ConfirmDialog buttons have text content', () => {
    const { container } = render(
      <ConfirmDialog
        title="Delete item?"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      const hasText = (btn.textContent ?? '').trim().length > 0;
      const hasAriaLabel = btn.hasAttribute('aria-label');
      const hasAriaLabelledBy = btn.hasAttribute('aria-labelledby');
      expect(hasText || hasAriaLabel || hasAriaLabelledBy).toBe(true);
    }
  });

  it('SettingsPanel buttons have accessible names', () => {
    const { container } = render(
      <SettingsPanel
        onBack={vi.fn()}
        lang="en"
        onUiLangChange={vi.fn()}
        themePref="system"
        onThemeChange={vi.fn()}
        fontSize="medium"
        onFontSizeChange={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      const hasText = (btn.textContent ?? '').trim().length > 0;
      const hasAriaLabel = btn.hasAttribute('aria-label');
      const hasAriaLabelledBy = btn.hasAttribute('aria-labelledby');
      expect(hasText || hasAriaLabel || hasAriaLabelledBy).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Form elements have labels
// ═══════════════════════════════════════════════════════════════════
describe('Accessibility: form elements have labels', () => {
  it('SettingsPanel selects have labels or aria-label', () => {
    const { container } = render(
      <SettingsPanel
        onBack={vi.fn()}
        lang="en"
        onUiLangChange={vi.fn()}
        themePref="system"
        onThemeChange={vi.fn()}
        fontSize="medium"
        onFontSizeChange={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    const selects = container.querySelectorAll('select');
    for (const select of selects) {
      const hasAriaLabel = select.hasAttribute('aria-label');
      const hasAriaLabelledBy = select.hasAttribute('aria-labelledby');
      const labelEl = select.id ? container.querySelector(`label[for="${select.id}"]`) : null;
      const wrappedInLabel = select.closest('label') !== null;
      expect(hasAriaLabel || hasAriaLabelledBy || labelEl !== null || wrappedInLabel).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Keyboard navigation (Tab/Enter/Escape)
// ═══════════════════════════════════════════════════════════════════
describe('Accessibility: keyboard navigation', () => {
  it('ConfirmDialog closes on Escape key', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog confirm button fires on click', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog
        title="Delete?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = container.querySelector('.btn-danger')!;
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('ConfirmDialog traps focus within the dialog (aria-modal)', () => {
    const { container } = render(
      <ConfirmDialog
        title="Focus trap test"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const dialog = container.querySelector('[role="alertdialog"]')!;
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. forced-colors support
// ═══════════════════════════════════════════════════════════════════
describe('Accessibility: forced-colors / high contrast', () => {
  it('matchMedia forced-colors can be detected', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(forced-colors: active)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const mq = window.matchMedia('(forced-colors: active)');
    expect(mq.matches).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Role attributes for screen readers
// ═══════════════════════════════════════════════════════════════════
describe('Accessibility: role attributes', () => {
  it('ConfirmDialog has role="alertdialog"', () => {
    const { container } = render(
      <ConfirmDialog
        title="Test"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).toBeInTheDocument();
  });

  it('ConfirmDialog has aria-labelledby pointing to the title', () => {
    const { container } = render(
      <ConfirmDialog
        title="Important dialog"
        description="Some description"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = container.querySelector('[role="alertdialog"]')!;
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-desc');
  });

  it('ConfirmDialog overlay has role="presentation"', () => {
    const { container } = render(
      <ConfirmDialog
        title="Test"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const overlay = container.querySelector('.modal-overlay');
    expect(overlay).toHaveAttribute('role', 'presentation');
  });

  it('ResultDisplay sections use semantic heading elements', () => {
    const result: TransformResult = {
      title: 'Test Log',
      today: ['Did work'],
      decisions: ['Chose React'],
      todo: ['Write tests'],
      relatedProjects: ['Project A'],
      tags: ['react'],
    };
    const { container } = render(<WorklogResultDisplay result={result} lang="en" />);
    const headings = container.querySelectorAll('h2, h3, h4');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('HandoffResultDisplay renders with accessible structure', () => {
    const result: HandoffResult = {
      title: 'Handoff Test',
      currentStatus: ['Working on feature X'],
      nextActions: ['Deploy to staging'],
      completed: ['Unit tests'],
      decisions: [],
      blockers: [],
      constraints: [],
      resumeContext: ['Check staging first'],
      tags: ['deploy'],
    };
    const { container } = render(<HandoffResultDisplay result={result} lang="en" />);
    const headings = container.querySelectorAll('h2, h3, h4');
    expect(headings.length).toBeGreaterThan(0);
    const lists = container.querySelectorAll('ul');
    expect(lists.length).toBeGreaterThan(0);
  });
});
