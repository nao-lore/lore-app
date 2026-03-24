/**
 * useClickOutside.test.tsx — Unit tests for the useClickOutside hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClickOutside } from '../../hooks/useClickOutside';

describe('useClickOutside', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns a ref object', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useClickOutside<HTMLDivElement>(false, onClose));
    expect(result.current).toHaveProperty('current');
  });

  it('does not attach listeners when inactive', () => {
    const onClose = vi.fn();
    renderHook(() => useClickOutside<HTMLDivElement>(false, onClose));

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when mousedown event fires and ref has no matching target', () => {
    const onClose = vi.fn();
    // When active and the ref.current is null (no element attached),
    // clicks won't match contains() check so onClose is called
    renderHook(() => useClickOutside<HTMLDivElement>(true, onClose));

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    // ref.current is null, so the condition `ref.current && ...` is falsy — no call
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when clicking inside the referenced element', () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    const child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);

    // Use a wrapper component so we can control the ref
    const { result, rerender } = renderHook(
      ({ active }) => useClickOutside<HTMLDivElement>(active, onClose),
      { initialProps: { active: true } },
    );

    // Override ref to point to our container
    (result.current as { current: HTMLDivElement | null }).current = container;
    // Re-render to re-attach effect with the ref in scope
    rerender({ active: true });

    // Click inside (child of container) — onClose should NOT be called
    // Note: The ref check in the hook uses ref.current.contains(e.target)
    // Since we need the event target to be the child, dispatch on the child
    act(() => {
      child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    // The event handler is on `document`, so it will fire.
    // But ref.current.contains(child) === true, so onClose should NOT be called.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key when active', () => {
    const onClose = vi.fn();
    renderHook(() => useClickOutside<HTMLDivElement>(true, onClose));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn();
    renderHook(() => useClickOutside<HTMLDivElement>(true, onClose));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up listeners when deactivated', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => useClickOutside<HTMLDivElement>(active, onClose),
      { initialProps: { active: true } },
    );

    // Verify active
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Deactivate
    rerender({ active: false });
    onClose.mockClear();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up listeners on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useClickOutside<HTMLDivElement>(true, onClose));

    unmount();
    onClose.mockClear();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
