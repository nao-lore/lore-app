import { useState, useRef, useEffect, useMemo } from 'react';
import type { Project, LogEntry, MasterNote, MasterNoteSnapshot } from './types';
import type { Lang } from './i18n';
import { t, tf } from './i18n';
import { getMasterNote, saveMasterNote, getMasterNoteHistory, restoreMasterNoteSnapshot, saveAiContext } from './storage';
import { generateMasterNote, refineMasterNote } from './masterNote';
import { generateProjectContext } from './generateProjectContext';
import { formatFullAiContext } from './formatHandoff';
import type { GenerateProgress } from './masterNote';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import { Pencil, Copy } from 'lucide-react';
import {
  normalizeItems,
  ReadOnlyText, ReadOnlyList, EditableText, EditableList, RelatedLogs,
  OverflowMenu, renderSimpleMarkdown,
} from './components/MasterNoteEditor';
import { MasterNoteHistoryPanel } from './components/MasterNoteHistory';

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
  const [saved, setSaved] = useState<MasterNote | undefined>(() => getMasterNote(project.id));
  const [draft, setDraft] = useState<MasterNote | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [simStep, setSimStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<MasterNoteSnapshot[]>(() => getMasterNoteHistory(project.id));
  const [previewSnap, setPreviewSnap] = useState<MasterNoteSnapshot | null>(null);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<number | null>(null);
  const [pendingNote, setPendingNote] = useState<MasterNote | null>(null);

  const projectLogs = logs.filter((l) => l.projectId === project.id);

  // AI Context: pure function, auto-computed from saved MasterNote + latestHandoff
  const aiContext = useMemo(() => {
    if (!saved) return '';
    const ctx = generateProjectContext(saved, logs, project.name);
    return formatFullAiContext(ctx, latestHandoff);
  }, [saved, latestHandoff, logs, project.name]);

  // Persist to storage so other views (detail view copy) can use getAiContext
  useEffect(() => {
    if (aiContext) {
      saveAiContext(project.id, aiContext);
    }
  }, [aiContext, project.id]);

  const summarySteps: ProgressStep[] = [
    { label: t('stepCollecting', lang), duration: 1500 },
    { label: t('stepAnalyzingLogs', lang), duration: 4000 },
    { label: t('stepMergingSummary', lang), duration: 3000 },
    { label: t('stepFinalizing', lang), duration: 1000 },
  ];

  const current = draft || saved;

  const enterEditMode = () => {
    if (saved && !draft) {
      setDraft({ ...saved });
    }
    setEditing(true);
  };

  const updateDraft = (updates: Partial<MasterNote>) => {
    if (!current) return;
    setDraft({ ...current, ...updates });
  };

  const generatingRef = useRef(false);
  const handleGenerate = async () => {
    if (generatingRef.current) {
      if (import.meta.env.DEV) console.warn('[MasterNote] handleGenerate already running — skipping duplicate call');
      return;
    }
    generatingRef.current = true;
    setLoading(true);
    setError(null);
    setProgress(null);
    setSimStep(0);
    try {
      if (import.meta.env.DEV) console.log('[MasterNote] Starting generation for project:', project.id, 'logs:', projectLogs.length);
      const proposed = await generateMasterNote(project.id, projectLogs, saved, (p) => {
        setProgress(p);
        if (import.meta.env.DEV) console.log('[MasterNote] Progress:', p.phase, p.current, '/', p.total);
        if (p.phase === 'extract') {
          setSimStep(p.current <= 1 ? 0 : 1);
        } else {
          setSimStep(2);
        }
      });
      if (import.meta.env.DEV) console.log('[MasterNote] Generation complete:', {
        overview: proposed.overview?.slice(0, 50),
        decisions: proposed.decisions.length,
        openIssues: proposed.openIssues.length,
        nextActions: proposed.nextActions.length,
      });
      setSimStep(4);
      setPendingNote(proposed);
      setEditing(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (import.meta.env.DEV) console.error('[MasterNote] Generation failed:', msg);
      setError(msg);
      showToast?.(t('failed', lang), 'error');
    } finally {
      generatingRef.current = false;
      setLoading(false);
      setProgress(null);
    }
  };

  const handleRefine = async () => {
    if (!current || !refineText.trim()) return;
    setRefining(true);
    setRefineOpen(false);
    setError(null);
    try {
      const refined = await refineMasterNote(current, refineText.trim());
      setPendingNote(refined);
      setEditing(false);
      setRefineText('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast?.(t('failed', lang), 'error');
    } finally {
      setRefining(false);
    }
  };

  const handleSave = () => {
    if (!current) return;
    const toSave = { ...current, updatedAt: Date.now() };
    saveMasterNote(toSave);
    setSaved(toSave);
    setDraft(null);
    setEditing(false);
    showToast?.(t('mnSaved', lang), 'success');
  };

  const handleCancel = () => {
    setDraft(null);
    setEditing(false);
  };

  const handleAccept = () => {
    if (!pendingNote) return;
    const toSave = { ...pendingNote, updatedAt: Date.now() };
    saveMasterNote(toSave);
    setSaved(toSave);
    setDraft(null);
    setPendingNote(null);
    setEditing(false);
    showToast?.(t('masterNoteUpdated', lang), 'success');
    setHistorySnapshots(getMasterNoteHistory(project.id));
  };

  function renderDiffSections(currentNote: MasterNote | null | undefined, pending: MasterNote) {
    const sections = [
      { label: t('mnDecisions', lang), current: currentNote?.decisions?.map((d) => d.text) || [], pending: pending.decisions?.map((d) => d.text) || [] },
      { label: t('mnOpenIssues', lang), current: currentNote?.openIssues?.map((d) => d.text) || [], pending: pending.openIssues?.map((d) => d.text) || [] },
      { label: t('mnNextActions', lang), current: currentNote?.nextActions?.map((d) => d.text) || [], pending: pending.nextActions?.map((d) => d.text) || [] },
    ];

    return sections.map((sec) => {
      const added = sec.pending.filter((txt) => !sec.current.includes(txt));
      const removed = sec.current.filter((txt) => !sec.pending.includes(txt));
      if (added.length === 0 && removed.length === 0) return null;

      return (
        <div key={sec.label} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{sec.label}</div>
          {added.map((item, i) => (
            <div key={`a${i}`} style={{ fontSize: 12, color: 'var(--success-text, #22c55e)', paddingLeft: 8 }}>+ {item}</div>
          ))}
          {removed.map((item, i) => (
            <div key={`r${i}`} style={{ fontSize: 12, color: 'var(--error-text)', textDecoration: 'line-through', paddingLeft: 8 }}>- {item}</div>
          ))}
        </div>
      );
    });
  }

  const openHistory = () => {
    const snaps = getMasterNoteHistory(project.id);
    setHistorySnapshots(snaps);
    setHistoryOpen(true);
    setPreviewSnap(null);
  };

  const handleRestore = (version: number) => {
    setConfirmRestoreVersion(version);
  };

  const executeRestore = () => {
    if (confirmRestoreVersion === null) return;
    const restored = restoreMasterNoteSnapshot(project.id, confirmRestoreVersion);
    if (restored) {
      setSaved(restored);
      setDraft(null);
      setEditing(false);
      setHistoryOpen(false);
      setPreviewSnap(null);
      setConfirmRestoreVersion(null);
      showToast?.(t('mnHistoryRestored', lang), 'success');
    }
  };

  const snapshots = historyOpen ? historySnapshots : [];

  const hasDraft = draft !== null;
  const hasPending = pendingNote !== null;
  const isProcessing = loading || refining;

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2>{t('masterNote', lang)}</h2>
            <p className="page-subtitle">{project.name}</p>
          </div>
          {current && !editing && !hasPending && (
            <OverflowMenu
              note={current}
              projectName={project.name}
              lang={lang}
              showToast={showToast}
              onEdit={enterEditMode}
              onRefine={() => setRefineOpen(!refineOpen)}
              onRegenerate={handleGenerate}
              onHistory={openHistory}
              disabled={isProcessing}
              historyCount={historySnapshots.length}
            />
          )}
        </div>
      </div>

      {/* Unreflected handoffs indicator */}
      {saved && (() => {
        const unreflected = projectLogs.filter(
          (l) => l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > saved.updatedAt,
        ).length;
        return unreflected > 0 ? (
          <div style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, background: 'var(--accent-bg)', border: '1px solid var(--accent-muted)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{tf('unreflectedHandoffs', lang, unreflected)}</span>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={isProcessing}
              style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}
            >
              {t('updateNow', lang)}
            </button>
          </div>
        ) : null;
      })()}

      {error && (
        <div className="alert-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {projectLogs.length === 0 ? (
        <div className="empty-state"><p>{t('mnNoLogs', lang)}</p></div>
      ) : !current && !loading && !pendingNote ? (
        <div className="mn-empty-cta">
          <div className="empty-state" style={{ marginBottom: 16 }}><p>{t('mnEmpty', lang)}</p></div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={isProcessing}>
            {t('mnGenerate', lang)}
          </button>
        </div>
      ) : (
        <>
          {/* Action bar */}
          <div className="mn-action-bar">
            {hasDraft && !editing && (
              <div className="mn-action-bar-label">
                {t('mnPreviewTitle', lang)}
              </div>
            )}
            {editing && (
              <div className="mn-action-bar-label">
                <Pencil size={14} style={{ color: 'var(--accent)' }} />
                <span>{t('mnEditMode', lang)}</span>
              </div>
            )}
            {!hasDraft && !editing && saved && (
              <div className="mn-action-bar-label">
                <span className="meta" style={{ fontSize: 12 }}>
                  {tf('mnUpdatedAt', lang, new Date(saved.updatedAt).toLocaleString())}
                  {' · '}
                  {tf('mnLogCount', lang, saved.relatedLogIds.length)}
                </span>
              </div>
            )}
            <div className="mn-action-bar-buttons">
              {(hasDraft || editing) && (
                <button className="btn btn-primary" onClick={handleSave} disabled={isProcessing}>
                  {t('mnAccept', lang)}
                </button>
              )}
              {(hasDraft || editing) && (
                <button className="btn" onClick={handleCancel} disabled={isProcessing}>
                  {t('mnEditCancel', lang)}
                </button>
              )}
            </div>
          </div>

          {/* Refine input */}
          {refineOpen && (
            <div className="mn-refine-panel">
              <textarea
                className="mn-refine-textarea"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder={t('mnRefineInstruction', lang)}
                rows={2}
                autoFocus
                maxLength={10000}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setRefineOpen(false); setRefineText(''); }}>
                  {t('mnRefineCancel', lang)}
                </button>
                <button className="btn btn-primary" onClick={handleRefine} disabled={!refineText.trim() || refining}>
                  {refining ? t('mnRefining', lang) : t('mnRefineSend', lang)}
                </button>
              </div>
            </div>
          )}

          {/* Progress */}
          {loading && (
            <div style={{ marginTop: 16, marginBottom: 24 }}>
              <ProgressPanel
                steps={summarySteps}
                state={{
                  stepIndex: simStep,
                  detail: progress
                    ? progress.phase === 'extract'
                      ? tf('mnExtracting', lang, progress.current, progress.total)
                      : t('mnMerging', lang)
                    : undefined,
                }}
                lang={lang}
              />
            </div>
          )}

          {refining && (
            <div style={{ marginTop: 16, marginBottom: 24 }}>
              <ProgressPanel
                steps={[
                  { label: t('stepAnalyzing', lang), duration: 2000 },
                  { label: t('stepOrganizing', lang), duration: 3000 },
                  { label: t('stepFinalizing', lang), duration: 1000 },
                ]}
                state={{ stepIndex: 0 }}
                lang={lang}
              />
            </div>
          )}

          {/* Pending MasterNote update preview */}
          {pendingNote && !loading && !refining && (
            <div className="content-card" style={{ marginBottom: 20, border: '2px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{t('pendingUpdate', lang)}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={handleAccept}>
                    {t('accept', lang)}
                  </button>
                  <button className="btn" onClick={() => setPendingNote(null)}>
                    {t('reject', lang)}
                  </button>
                </div>
              </div>

              {/* Diff preview showing what changed */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('current', lang)}</div>
                  <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                    {saved?.overview || t('empty', lang)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>{t('proposed', lang)}</div>
                  <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--accent)' }}>
                    {pendingNote.overview || t('empty', lang)}
                  </div>
                </div>
              </div>

              {renderDiffSections(saved, pendingNote)}
            </div>
          )}

          {/* Read-only view (default) */}
          {current && !loading && !refining && !editing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ReadOnlyText label={t('mnOverview', lang)} value={current.overview} />
              <ReadOnlyList label={t('mnDecisions', lang)} items={normalizeItems(current.decisions)} logs={logs} onOpenLog={onOpenLog} />
              <ReadOnlyList label={t('mnOpenIssues', lang)} items={normalizeItems(current.openIssues)} logs={logs} onOpenLog={onOpenLog} />
              <ReadOnlyList label={t('mnNextActions', lang)} items={normalizeItems(current.nextActions)} logs={logs} onOpenLog={onOpenLog} />
              <RelatedLogs logIds={current.relatedLogIds} logs={logs} onOpenLog={onOpenLog} lang={lang} />

              {/* AI Context section */}
              <div className="content-card">
                <div className="content-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('aiContextTitle', lang)}</span>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: '2px 8px', minHeight: 24, display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(aiContext);
                        showToast?.(t('copiedToClipboard', lang), 'success');
                      } catch {
                        showToast?.(t('copyFailed', lang), 'error');
                      }
                    }}
                    disabled={!aiContext}
                  >
                    <Copy size={11} />
                    {t('mnCopy', lang)}
                  </button>
                </div>
                {aiContext ? (
                  <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, maxHeight: 400, overflow: 'auto' }}>
                    {renderSimpleMarkdown(aiContext)}
                  </div>
                ) : (
                  <p className="meta" style={{ fontSize: 12, margin: 0 }}>{t('aiContextEmpty', lang)}</p>
                )}
              </div>

              <p className="meta" style={{ fontSize: 12, textAlign: 'right' }}>
                {tf('mnUpdatedAt', lang, new Date(current.updatedAt).toLocaleString())}
                {' · '}
                {tf('mnLogCount', lang, current.relatedLogIds.length)}
              </p>
            </div>
          )}

          {/* Edit mode */}
          {current && !loading && !refining && editing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <EditableText
                label={t('mnOverview', lang)}
                value={current.overview}
                onChange={(v) => updateDraft({ overview: v })}
              />
              <EditableList
                label={t('mnDecisions', lang)}
                items={normalizeItems(current.decisions)}
                onChange={(items) => updateDraft({ decisions: items })}
                logs={logs}
                onOpenLog={onOpenLog}
                lang={lang}
              />
              <EditableList
                label={t('mnOpenIssues', lang)}
                items={normalizeItems(current.openIssues)}
                onChange={(items) => updateDraft({ openIssues: items })}
                logs={logs}
                onOpenLog={onOpenLog}
                lang={lang}
              />
              <EditableList
                label={t('mnNextActions', lang)}
                items={normalizeItems(current.nextActions)}
                onChange={(items) => updateDraft({ nextActions: items })}
                logs={logs}
                onOpenLog={onOpenLog}
                lang={lang}
              />
              <RelatedLogs logIds={current.relatedLogIds} logs={logs} onOpenLog={onOpenLog} lang={lang} />
            </div>
          )}
        </>
      )}

      {/* History panel */}
      {historyOpen && (
        <MasterNoteHistoryPanel
          lang={lang}
          saved={saved}
          snapshots={snapshots}
          previewSnap={previewSnap}
          confirmRestoreVersion={confirmRestoreVersion}
          onClose={() => setHistoryOpen(false)}
          onPreviewSnap={setPreviewSnap}
          onRestore={handleRestore}
          onConfirmRestore={executeRestore}
          onCancelRestore={() => setConfirmRestoreVersion(null)}
        />
      )}
    </div>
  );
}
