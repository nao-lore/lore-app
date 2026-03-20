import { useContext } from 'react';
import { WorkspaceContext } from '../contexts/WorkspaceContext';
import type { WorkspaceContextValue } from '../contexts/WorkspaceContext';

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return ctx;
}
