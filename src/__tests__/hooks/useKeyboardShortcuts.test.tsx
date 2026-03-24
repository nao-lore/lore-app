/**
 * useKeyboardShortcuts.test.tsx — Unit tests for the useKeyboardShortcuts hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock storage to enable keyboard shortcuts feature
vi.mock('../../storage', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getFeatureEnabled: (key: string, fallback: boolean) => {
      if (key === 'keyboard_shortcuts') return true;
      return fallback;
    },
  };
});

import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

function makeOpts(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  return {
    setPaletteOpen: vi.fn(),
    handleNewLog: vi.fn(),
    goToRaw: vi.fn(),
    goTo: vi.fn(),
    setShortcutsOpen: vi.fn(),
    shortcutsOpen: false,
    paletteOpen: false,
    view: 'input' as const,
    prevView: 'input' as const,
    activeProjectId: null,
    setActiveProjectId: vi.fn(),
    ...overrides,
  };
}

function dispatchKey(key: string, meta = false, ctrl = false) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      metaKey: meta,
      ctrlKey: ctrl,
      bubbles: true,
    }));
  });
}

describe('useKeyboardShortcuts — meta key shortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Cmd+K toggles command palette', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('k', true);
    expect(opts.setPaletteOpen).toHaveBeenCalledTimes(1);
  });

  it('Cmd+N creates new log', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('n', true);
    expect(opts.handleNewLog).toHaveBeenCalledTimes(1);
  });

  it('Cmd+, opens settings', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey(',', true);
    expect(opts.goToRaw).toHaveBeenCalledWith('settings');
  });
});

describe('useKeyboardShortcuts — number key navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('1 navigates to input', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('1');
    expect(opts.goTo).toHaveBeenCalledWith('input');
  });

  it('2 navigates to dashboard', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('2');
    expect(opts.goTo).toHaveBeenCalledWith('dashboard');
  });

  it('3 navigates to history', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('3');
    expect(opts.goTo).toHaveBeenCalledWith('history');
  });

  it('4 navigates to projects', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('4');
    expect(opts.goTo).toHaveBeenCalledWith('projects');
  });

  it('5 navigates to todos', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('5');
    expect(opts.goTo).toHaveBeenCalledWith('todos');
  });

  it('does not navigate with number keys when in input field', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    // Create and focus an input element
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    dispatchKey('1');
    expect(opts.goTo).not.toHaveBeenCalled();
  });
});

describe('useKeyboardShortcuts — ? shortcut', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('? toggles shortcuts modal', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('?');
    expect(opts.setShortcutsOpen).toHaveBeenCalled();
  });

  it('? does not trigger when in input field', () => {
    const opts = makeOpts();
    renderHook(() => useKeyboardShortcuts(opts));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    dispatchKey('?');
    expect(opts.setShortcutsOpen).not.toHaveBeenCalled();
  });
});

describe('useKeyboardShortcuts — Escape behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Escape closes shortcuts modal first', () => {
    const opts = makeOpts({ shortcutsOpen: true });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.setShortcutsOpen).toHaveBeenCalledWith(false);
    // Should not also close palette
    expect(opts.setPaletteOpen).not.toHaveBeenCalled();
  });

  it('Escape closes palette when shortcuts is closed', () => {
    const opts = makeOpts({ paletteOpen: true });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.setPaletteOpen).toHaveBeenCalled();
  });

  it('Escape navigates back from non-input view', () => {
    const opts = makeOpts({ view: 'history', prevView: 'input' });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.goToRaw).toHaveBeenCalledWith('input');
  });

  it('Escape does nothing on input view', () => {
    const opts = makeOpts({ view: 'input' });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.goToRaw).not.toHaveBeenCalled();
  });

  it('Escape from detail goes to prevView', () => {
    const opts = makeOpts({ view: 'detail', prevView: 'history' });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.goToRaw).toHaveBeenCalledWith('history');
  });

  it('Escape from detail with prevView=detail goes to projecthome when activeProjectId', () => {
    const opts = makeOpts({ view: 'detail', prevView: 'detail', activeProjectId: 'proj-1' });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.goToRaw).toHaveBeenCalledWith('projecthome');
  });

  it('Escape from detail with prevView=detail goes to history when no activeProjectId', () => {
    const opts = makeOpts({ view: 'detail', prevView: 'detail', activeProjectId: null });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.goToRaw).toHaveBeenCalledWith('history');
  });

  it('Escape from projecthome clears activeProjectId and goes to input', () => {
    const opts = makeOpts({ view: 'projecthome', prevView: 'projects' });
    renderHook(() => useKeyboardShortcuts(opts));

    dispatchKey('Escape');
    expect(opts.setActiveProjectId).toHaveBeenCalledWith(null);
    expect(opts.goToRaw).toHaveBeenCalledWith('input');
  });
});

describe('useKeyboardShortcuts — cleanup', () => {
  it('removes event listener on unmount', () => {
    const opts = makeOpts();
    const { unmount } = renderHook(() => useKeyboardShortcuts(opts));

    unmount();
    opts.goTo.mockClear();

    dispatchKey('2');
    expect(opts.goTo).not.toHaveBeenCalled();
  });
});
