import { lazy } from 'react';
import type { LogEntry, Project } from './types';
import type { Lang } from './i18n';

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
}

export default function Workspace({ mode, selectedId, onSaved, onDeleted, onOpenLog, onBack, prevView, lang, activeProjectId, projects, onRefresh, showToast, onDirtyChange, onTagFilter, onOpenMasterNote, allLogs, pendingTodosCount, lastLogCreatedAt }: WorkspaceProps) {
  if (mode === 'detail' && selectedId) return <DetailView id={selectedId} onDeleted={onDeleted} onOpenLog={onOpenLog} onBack={onBack} prevView={prevView} lang={lang} projects={projects} onRefresh={onRefresh} showToast={showToast} onTagFilter={onTagFilter} allLogs={allLogs} onOpenMasterNote={onOpenMasterNote} />;
  return <InputView onSaved={onSaved} onOpenLog={onOpenLog} lang={lang} activeProjectId={activeProjectId} projects={projects} showToast={showToast} onDirtyChange={onDirtyChange} pendingTodosCount={pendingTodosCount} lastLogCreatedAt={lastLogCreatedAt} />;
}
