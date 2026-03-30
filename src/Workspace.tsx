import { lazy } from 'react';
import type { LogEntry, Project } from './types';
import type { Lang } from './i18n';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import type { WorkspaceContextValue } from './contexts/WorkspaceContext';

const InputView = lazy(() => import('./InputView'));
const DetailView = lazy(() => import('./DetailView'));

type WorkspaceMode = 'input' | 'detail';

interface WorkspaceProps {
  mode: WorkspaceMode;
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
  onShowOnboarding?: () => void;
}

export default function Workspace(props: WorkspaceProps) {
  const { mode, selectedId, onSaved, onDeleted, onOpenLog, onBack, prevView, lang, activeProjectId, projects, onRefresh, showToast, onDirtyChange, onTagFilter, onOpenMasterNote, allLogs, pendingTodosCount, lastLogCreatedAt, onShowOnboarding } = props;

  const ctxValue: WorkspaceContextValue = {
    mode, selectedId, onSaved, onDeleted, onOpenLog, onBack, prevView, lang,
    activeProjectId, projects, onRefresh, showToast, onDirtyChange, onTagFilter,
    onOpenMasterNote, allLogs, pendingTodosCount, lastLogCreatedAt,
  };

  return (
    <WorkspaceProvider value={ctxValue}>
      {mode === 'detail' && selectedId
        ? <DetailView id={selectedId} onDeleted={onDeleted} onOpenLog={onOpenLog} onBack={onBack} prevView={prevView} lang={lang} projects={projects} onRefresh={onRefresh} showToast={showToast} onTagFilter={onTagFilter} allLogs={allLogs} onOpenMasterNote={onOpenMasterNote} />
        : <InputView onSaved={onSaved} onOpenLog={onOpenLog} lang={lang} activeProjectId={activeProjectId} projects={projects} showToast={showToast} onDirtyChange={onDirtyChange} pendingTodosCount={pendingTodosCount} lastLogCreatedAt={lastLogCreatedAt} onRefresh={onRefresh} onShowOnboarding={onShowOnboarding} />
      }
    </WorkspaceProvider>
  );
}
