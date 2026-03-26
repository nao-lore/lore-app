/**
 * useWorkspaceContext.test.tsx — Unit tests for the useWorkspaceContext hook
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderHook } from '@testing-library/react';

// Suppress console.error for expected error boundary throws
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('useWorkspaceContext must be used within')) return;
    // Also suppress React error boundary noise
    if (typeof args[0] === 'string' && (args[0].includes('Uncaught') || args[0].includes('The above error'))) return;
    originalError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalError;
});

import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

describe('useWorkspaceContext', () => {
  it('throws when used outside WorkspaceProvider', () => {
    expect(() => {
      renderHook(() => useWorkspaceContext());
    }).toThrow('useWorkspaceContext must be used within a WorkspaceProvider');
  });
});
