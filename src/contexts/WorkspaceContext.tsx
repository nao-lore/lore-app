import { createContext, useContext } from 'react';
import type { LogEntry, Project } from '../types';
import type { Lang } from '../i18n';

export interface WorkspaceContextValue {
  mode: 'input' | 'detail';
  selectedId: string | null;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onOpenLog: (id: string) => void;
  onBack: () => void;
  prevView: string;
  lang: Lang;
  activeProjectId: string | null;
  projects: Project[];
  onRefresh: () => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onTagFilter?: (tag: string) => void;
  onOpenMasterNote?: (projectId: string) => void;
  allLogs: LogEntry[];
  pendingTodosCount: number;
  lastLogCreatedAt: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return ctx;
}
