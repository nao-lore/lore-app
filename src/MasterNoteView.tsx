import { useState, useRef, useEffect, useMemo } from 'react';
import type { Project, LogEntry, MasterNote, MasterNoteSnapshot, SourcedItem } from './types';
import type { Lang } from './i18n';
import { t, tf } from './i18n';
import { getMasterNote, saveMasterNote, getMasterNoteHistory, restoreMasterNoteSnapshot, saveAiContext } from './storage';
import { generateMasterNote, refineMasterNote } from './masterNote';
import { generateProjectContext } from './generateProjectContext';
import { formatFullAiContext } from './formatHandoff';
import type { GenerateProgress } from './masterNote';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import { Pencil, Copy, ExternalLink, FileText } from 'lucide-react';

// Extracted components
import { OverflowMenu, PendingNotePreview } from './components/MasterNoteGenerate';
import { normalizeItems, renderSimpleMarkdown } from './components/masterNoteHelpers';
import { MasterNoteHistoryPanel } from './components/MasterNoteHistory';

// ---- Read-only display ----

function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <div className="content-card">
      <div className="content-card-header">{label}</div>
      <p className="help-body-text">
        {value || '\u00a0'}
      </p>
    </div>
  );
}

function ReadOnlyList({
  label,
  items,
  logs,
  onOpenLog,
}: {
  label: string;
  items: SourcedItem[];
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{label}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => {
          const validSources = item.sourceLogIds
            .map((id) => ({ id, log: logs.find((l) => l.id === id) }))
            .filter((s): s is { id: string; log: LogEntry } => !!s.log);
          return (
            <li key={i} className="text-md lh-relaxed" style={{ marginBottom: 4 }}>
              {item.text}
              {validSources.length > 0 && (
                <span className="mn-source-links">
                  {validSources.map((s) => (
                    <button
                      key={s.id}
                      className="log-link-icon"
                      onClick={() => onOpenLog(s.id)}
                      title={s.log.title}
                    >
                      <ExternalLink size={14} />
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Editable components (edit mode only) ----

function EditableText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="content-card">
      <div className="content-card-header">{label}</div>
      <textarea
        className="mn-edit-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={10000}
        aria-label={label}
      />
    </div>
  );
}

function EditableList({
  label,
  items,
  onChange,
  logs,
  onOpenLog,
  lang,
}: {
  label: string;
  items: SourcedItem[];
  onChange: (items: SourcedItem[]) => void;
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
  lang: Lang;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const updateItem = (i: number, text: string) => {
    const next = [...items];
    next[i] = { ...next[i], text };
    onChange(next);
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const addItem = () => {
    onChange([...items, { text: '', sourceLogIds: [] }]);
    setEditingIdx(items.length);
  };

  return (
    <div className="content-card">
      <div className="content-card-header">{label}</div>
      <ul className="mn-editable-list">
        {items.map((item, i) => {
          const validSources = item.sourceLogIds
            .map((id) => ({ id, log: logs.find((l) => l.id === id) }))
            .filter((s): s is { id: string; log: LogEntry } => !!s.log);

          return (
            <li key={i} className="mn-editable-list-item">
              {editingIdx === i ? (
                <input
                  className="mn-edit-input"
                  value={item.text}
                  aria-label={t('ariaEditTitle', lang)}
                  onChange={(e) => updateItem(i, e.target.value)}
                  onBlur={() => setEditingIdx(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingIdx(null);
                    if (e.key === 'Escape') setEditingIdx(null);
                  }}
                  autoFocus
                  maxLength={200}
                />
              ) : (
                <span
                  className="mn-editable-item-text"
                  onClick={() => setEditingIdx(i)}
                >
                  {item.text || '\u00a0'}
                </span>
              )}
              {editingIdx !== i && validSources.length > 0 && (
                <span className="mn-source-links">
                  {validSources.map((s) => (
                    <button
                      key={s.id}
                      className="log-link-icon"
                      onClick={() => onOpenLog(s.id)}
                      title={s.log.title}
                    >
                      <ExternalLink size={14} />
                    </button>
                  ))}
                </span>
              )}
              {editingIdx !== i && (
                <button
                  className="mn-item-remove"
                  onClick={() => removeItem(i)}
                  title={t('mnRemoveItem', lang)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button className="btn-link mn-add-item" onClick={addItem}>
        {t('mnAddItem', lang)}
      </button>
    </div>
  );
}

// ---- Related Logs (read-only always) ----

function RelatedLogs({ logIds, logs, onOpenLog, lang }: { logIds: string[]; logs: LogEntry[]; onOpenLog: (id: string) => void; lang: Lang }) {
  if (logIds.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{t('mnRelatedLogs', lang)}</div>
      <div className="flex-col" style={{ gap: 4 }}>
        {logIds.map((logId) => {
          const log = logs.find((l) => l.id === logId);
          if (!log) return null;
          return (
            <button
              key={logId}
              className="btn-link text-sm text-left"
              onClick={() => onOpenLog(logId)}
            >
              {log.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Main Component ----

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

  // AI Context
  const aiContext = useMemo(() => {
    if (!saved) return '';
    const ctx = generateProjectContext(saved, logs, project.name);
    return formatFullAiContext(ctx, latestHandoff);
  }, [saved, latestHandoff, logs, project.name]);

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

  // --- Generate ---
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

  // --- Refine ---
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

  // --- Save ---
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

  // --- Accept pending ---
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

  // --- History ---
  const openHistory = () => {
    const snaps = getMasterNoteHistory(project.id);
    setHistorySnapshots(snaps);
    setHistoryOpen(true);
    setPreviewSnap(null);
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
        <button className="btn-back btn-back-mb" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <div className="flex items-start justify-between">
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
          <div className="flex-row flex-wrap" style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, background: 'var(--accent-bg)', border: '1px solid var(--accent-muted)', borderRadius: 8, gap: 10 }}>
            <span>{tf('unreflectedHandoffs', lang, unreflected)}</span>
            <button
              className="btn btn-primary btn-sm-compact"
              onClick={handleGenerate}
              disabled={isProcessing}
            >
              {t('updateNow', lang)}
            </button>
          </div>
        ) : null;
      })()}

      {error && (
        <div className="alert-error mb-20">
          {error}
        </div>
      )}

      {projectLogs.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon"><FileText size={48} strokeWidth={1.2} color="var(--text-muted)" opacity={0.4} /></div><p>{t('mnNoLogs', lang)}</p></div>
      ) : !current && !loading && !pendingNote ? (
        <div className="mn-empty-cta">
          <div className="empty-state mb-lg"><p>{t('mnEmpty', lang)}</p></div>
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
                aria-label={t('mnRefineInstruction', lang)}
                rows={2}
                autoFocus
                maxLength={10000}
              />
              <div className="flex justify-end gap-3">
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
            <PendingNotePreview
              lang={lang}
              saved={saved}
              pendingNote={pendingNote}
              onAccept={handleAccept}
              onReject={() => setPendingNote(null)}
            />
          )}

          {/* Read-only view (default) */}
          {current && !loading && !refining && !editing && (
            <div className="flex-col-gap-md">
              <ReadOnlyText label={t('mnOverview', lang)} value={current.overview} />
              <ReadOnlyList label={t('mnDecisions', lang)} items={normalizeItems(current.decisions)} logs={logs} onOpenLog={onOpenLog} />
              <ReadOnlyList label={t('mnOpenIssues', lang)} items={normalizeItems(current.openIssues)} logs={logs} onOpenLog={onOpenLog} />
              <ReadOnlyList label={t('mnNextActions', lang)} items={normalizeItems(current.nextActions)} logs={logs} onOpenLog={onOpenLog} />
              <RelatedLogs logIds={current.relatedLogIds} logs={logs} onOpenLog={onOpenLog} lang={lang} />

              {/* AI Context section */}
              <div className="content-card">
                <div className="content-card-header flex items-center justify-between">
                  <span>{t('aiContextTitle', lang)}</span>
                  <button
                    className="btn btn-sm-compact"
                    style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
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
                  <p className="meta text-sm" style={{ margin: 0 }}>{t('aiContextEmpty', lang)}</p>
                )}
              </div>

              <p className="meta text-sm text-right">
                {tf('mnUpdatedAt', lang, new Date(current.updatedAt).toLocaleString())}
                {' · '}
                {tf('mnLogCount', lang, current.relatedLogIds.length)}
              </p>
            </div>
          )}

          {/* Edit mode */}
          {current && !loading && !refining && editing && (
            <div className="flex-col-gap-md">
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
          onRestore={(version) => setConfirmRestoreVersion(version)}
          onConfirmRestore={executeRestore}
          onCancelRestore={() => setConfirmRestoreVersion(null)}
        />
      )}
    </div>
  );
}
