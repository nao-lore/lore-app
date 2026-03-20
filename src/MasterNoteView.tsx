import type { Project, LogEntry } from './types';
import type { Lang } from './i18n';
import { t, tf } from './i18n';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import { FileText } from 'lucide-react';

// Extracted components
import { OverflowMenu, PendingNotePreview } from './components/MasterNoteGenerate';
import { MasterNoteHistoryPanel } from './components/MasterNoteHistory';
import { MasterNoteActionBar, MasterNoteRefinePanel, MasterNoteReadOnly, MasterNoteEditContent } from './components/MasterNoteToolbar';
import { useMasterNoteActions } from './hooks/useMasterNoteActions';

interface MasterNoteViewProps {
  project: Project;
  logs: LogEntry[];
  latestHandoff?: LogEntry;
  onBack: () => void;
  onOpenLog: (id: string) => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export default function MasterNoteView({ project, logs, latestHandoff, onBack, onOpenLog, lang, showToast }: MasterNoteViewProps) {
  const mn = useMasterNoteActions({ projectId: project.id, projectName: project.name, logs, latestHandoff, lang, showToast });

  const summarySteps: ProgressStep[] = [
    { label: t('stepCollecting', lang), duration: 1500 },
    { label: t('stepAnalyzingLogs', lang), duration: 4000 },
    { label: t('stepMergingSummary', lang), duration: 3000 },
    { label: t('stepFinalizing', lang), duration: 1000 },
  ];

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back btn-back-mb" onClick={onBack}>← {t('back', lang)}</button>
        <div className="flex items-start justify-between">
          <div>
            <h2>{t('masterNote', lang)}</h2>
            <p className="page-subtitle">{project.name}</p>
          </div>
          {mn.current && !mn.editing && !mn.hasPending && (
            <OverflowMenu note={mn.current} projectName={project.name} lang={lang} showToast={showToast} onEdit={mn.enterEditMode} onRefine={() => mn.setRefineOpen(!mn.refineOpen)} onRegenerate={mn.handleGenerate} onHistory={mn.openHistory} disabled={mn.isProcessing} historyCount={mn.historySnapshots.length} />
          )}
        </div>
      </div>

      {mn.saved && (() => {
        const unreflected = mn.projectLogs.filter((l) => l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > mn.saved!.updatedAt).length;
        return unreflected > 0 ? (
          <div className="flex-row flex-wrap" style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, background: 'var(--accent-bg)', border: '1px solid var(--accent-muted)', borderRadius: 8, gap: 10 }}>
            <span>{tf('unreflectedHandoffs', lang, unreflected)}</span>
            <button className="btn btn-primary btn-sm-compact" onClick={mn.handleGenerate} disabled={mn.isProcessing}>{t('updateNow', lang)}</button>
          </div>
        ) : null;
      })()}

      {mn.error && <div className="alert-error mb-20">{mn.error}</div>}

      {mn.projectLogs.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon"><FileText size={48} strokeWidth={1.2} color="var(--text-muted)" opacity={0.4} /></div><p>{t('mnNoLogs', lang)}</p></div>
      ) : !mn.current && !mn.loading && !mn.pendingNote ? (
        <div className="mn-empty-cta">
          <div className="empty-state mb-lg"><p>{t('mnEmpty', lang)}</p></div>
          <button className="btn btn-primary" onClick={mn.handleGenerate} disabled={mn.isProcessing}>{t('mnGenerate', lang)}</button>
        </div>
      ) : (
        <>
          <MasterNoteActionBar lang={lang} hasDraft={mn.hasDraft} editing={mn.editing} saved={mn.saved} isProcessing={mn.isProcessing} onSave={mn.handleSave} onCancel={mn.handleCancel} />

          {mn.refineOpen && <MasterNoteRefinePanel lang={lang} refineText={mn.refineText} onRefineTextChange={mn.setRefineText} onClose={() => { mn.setRefineOpen(false); mn.setRefineText(''); }} onRefine={mn.handleRefine} refining={mn.refining} />}

          {mn.loading && (
            <div style={{ marginTop: 16, marginBottom: 24 }}>
              <ProgressPanel steps={summarySteps} state={{ stepIndex: mn.simStep, detail: mn.progress ? (mn.progress.phase === 'extract' ? tf('mnExtracting', lang, mn.progress.current, mn.progress.total) : t('mnMerging', lang)) : undefined }} lang={lang} />
            </div>
          )}

          {mn.refining && (
            <div style={{ marginTop: 16, marginBottom: 24 }}>
              <ProgressPanel steps={[{ label: t('stepAnalyzing', lang), duration: 2000 }, { label: t('stepOrganizing', lang), duration: 3000 }, { label: t('stepFinalizing', lang), duration: 1000 }]} state={{ stepIndex: 0 }} lang={lang} />
            </div>
          )}

          {mn.pendingNote && !mn.loading && !mn.refining && <PendingNotePreview lang={lang} saved={mn.saved} pendingNote={mn.pendingNote} onAccept={mn.handleAccept} onReject={() => mn.setPendingNote(null)} />}

          {mn.current && !mn.loading && !mn.refining && !mn.editing && <MasterNoteReadOnly current={mn.current} logs={logs} onOpenLog={onOpenLog} lang={lang} aiContext={mn.aiContext} showToast={showToast} />}

          {mn.current && !mn.loading && !mn.refining && mn.editing && <MasterNoteEditContent current={mn.current} logs={logs} onOpenLog={onOpenLog} lang={lang} onUpdateDraft={mn.updateDraft} />}
        </>
      )}

      {mn.historyOpen && <MasterNoteHistoryPanel lang={lang} saved={mn.saved} snapshots={mn.historyOpen ? mn.historySnapshots : []} previewSnap={mn.previewSnap} confirmRestoreVersion={mn.confirmRestoreVersion} onClose={() => mn.setHistoryOpen(false)} onPreviewSnap={mn.setPreviewSnap} onRestore={(v) => mn.setConfirmRestoreVersion(v)} onConfirmRestore={mn.executeRestore} onCancelRestore={() => mn.setConfirmRestoreVersion(null)} />}
    </div>
  );
}
