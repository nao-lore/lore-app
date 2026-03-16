import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { Pencil, MoreVertical, Copy, Download, RefreshCw, History, ExternalLink } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

/** Lightweight inline markdown renderer for AI Context preview */
function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  const inlineBold = (line: string, key: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    const re = /\*\*(.+?)\*\*/g;
    let m: RegExpExecArray | null;
    let pi = 0;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIdx) {
        parts.push(<span key={`${key}-t${pi}`}>{line.slice(lastIdx, m.index)}</span>);
        pi++;
      }
      parts.push(<strong key={`${key}-b${pi}`}>{m[1]}</strong>);
      pi++;
      lastIdx = re.lastIndex;
    }
    if (lastIdx < line.length) {
      parts.push(<span key={`${key}-t${pi}`}>{line.slice(lastIdx)}</span>);
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Blank line → spacing
    if (line.trim() === '') {
      result.push(<div key={`blank-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // ## Heading
    if (/^## /.test(line)) {
      result.push(
        <div key={`h2-${i}`} style={{ fontWeight: 700, fontSize: 14, marginTop: 8, marginBottom: 2 }}>
          {inlineBold(line.replace(/^## /, ''), `h2-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    // ### Heading
    if (/^### /.test(line)) {
      result.push(
        <div key={`h3-${i}`} style={{ fontWeight: 700, fontSize: 13, marginTop: 6, marginBottom: 2 }}>
          {inlineBold(line.replace(/^### /, ''), `h3-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    // - bullet list item
    if (/^[-*] /.test(line)) {
      result.push(
        <div key={`li-${i}`} style={{ display: 'flex', gap: 6, paddingLeft: 8 }}>
          <span style={{ flexShrink: 0 }}>{'\u2022'}</span>
          <span>{inlineBold(line.replace(/^[-*] /, ''), `li-${i}`)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Regular line
    result.push(
      <div key={`p-${i}`}>{inlineBold(line, `p-${i}`)}</div>
    );
    i++;
  }

  return result;
}

interface MasterNoteViewProps {
  project: Project;
  logs: LogEntry[];
  latestHandoff?: LogEntry;
  onBack: () => void;
  onOpenLog: (id: string) => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

function normalizeItems(raw: SourcedItem[] | string[]): SourcedItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((text) => ({ text, sourceLogIds: [] }));
  }
  return raw as SourcedItem[];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

// ---- Snapshot preview (read-only, no source links) ----

function SnapshotPreview({ note, lang }: { note: MasterNote; lang: Lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
      <div>
        <div className="content-card-header">{t('mnOverview', lang)}</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--text-body)' }}>{note.overview || '—'}</p>
      </div>
      {note.decisions.length > 0 && (
        <div>
          <div className="content-card-header">{t('mnDecisions', lang)}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {note.decisions.map((d, i) => <li key={i}>{d.text}</li>)}
          </ul>
        </div>
      )}
      {note.openIssues.length > 0 && (
        <div>
          <div className="content-card-header">{t('mnOpenIssues', lang)}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {note.openIssues.map((d, i) => <li key={i}>{d.text}</li>)}
          </ul>
        </div>
      )}
      {note.nextActions.length > 0 && (
        <div>
          <div className="content-card-header">{t('mnNextActions', lang)}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {note.nextActions.map((d, i) => <li key={i}>{d.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Read-only display ----

function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <div className="content-card">
      <div className="content-card-header">{label}</div>
      <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, color: 'var(--text-body)' }}>
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
            <li key={i} style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 4 }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {logIds.map((logId) => {
          const log = logs.find((l) => l.id === logId);
          if (!log) return null;
          return (
            <button
              key={logId}
              className="btn-link"
              onClick={() => onOpenLog(logId)}
              style={{ fontSize: 13, textAlign: 'left' }}
            >
              {log.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Export helpers ----

function noteToMarkdown(note: MasterNote, projectName: string, lang: Lang): string {
  const lines: string[] = [];
  lines.push(`# Project Summary: ${projectName}`);
  lines.push('');
  lines.push(`## ${t('mnOverview', lang)}`);
  lines.push(note.overview);
  lines.push('');

  const sections: [string, SourcedItem[]][] = [
    [t('mnDecisions', lang), normalizeItems(note.decisions)],
    [t('mnOpenIssues', lang), normalizeItems(note.openIssues)],
    [t('mnNextActions', lang), normalizeItems(note.nextActions)],
  ];

  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`## ${title}`);
    for (const item of items) {
      lines.push(`- ${item.text}`);
    }
    lines.push('');
  }

  const date = new Date(note.updatedAt).toLocaleString();
  lines.push(`---`);
  lines.push(`*${t('mnLastUpdated', lang)}: ${date}*`);
  return lines.join('\n');
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Three-dot menu ----

function OverflowMenu({
  note,
  projectName,
  lang,
  showToast,
  onEdit,
  onRefine,
  onRegenerate,
  onHistory,
  disabled,
  historyCount,
}: {
  note: MasterNote;
  projectName: string;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  onEdit: () => void;
  onRefine: () => void;
  onRegenerate: () => void;
  onHistory: () => void;
  disabled?: boolean;
  historyCount: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCopy = async () => {
    const md = noteToMarkdown(note, projectName, lang);
    try {
      await navigator.clipboard.writeText(md);
      showToast?.(t('mnCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
    setOpen(false);
  };

  const handleDownloadMd = () => {
    const md = noteToMarkdown(note, projectName, lang);
    const safeName = projectName.replace(/[^a-zA-Z0-9\u3000-\u9fff\uff00-\uffef_-]/g, '_');
    downloadFile(md, `project-summary-${safeName}.md`, 'text/markdown');
    setOpen(false);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(note, null, 2);
    const safeName = projectName.replace(/[^a-zA-Z0-9\u3000-\u9fff\uff00-\uffef_-]/g, '_');
    downloadFile(json, `project-summary-${safeName}.json`, 'application/json');
    setOpen(false);
  };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost mn-export-trigger"
        onClick={() => setOpen(!open)}
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="dropdown-menu">
          <button className="mn-export-item" onClick={() => { setOpen(false); onEdit(); }} disabled={disabled}>
            <Pencil size={14} />
            <span>{t('mnEdit', lang)}</span>
          </button>
          <div className="mn-export-divider" />
          <button className="mn-export-item" onClick={handleCopy}>
            <Copy size={14} />
            <span>{t('mnCopy', lang)}</span>
          </button>
          <button className="mn-export-item" onClick={handleDownloadMd}>
            <Download size={14} />
            <span>{t('mnDownloadMd', lang)}</span>
          </button>
          <button className="mn-export-item" onClick={handleDownloadJson}>
            <Download size={14} />
            <span>{t('mnDownloadJson', lang)}</span>
          </button>
          <div className="mn-export-divider" />
          <button className="mn-export-item" onClick={() => { setOpen(false); onRefine(); }} disabled={disabled}>
            <Pencil size={14} />
            <span>{t('mnRefine', lang)}</span>
          </button>
          <button className="mn-export-item" onClick={() => { setOpen(false); onRegenerate(); }} disabled={disabled}>
            <RefreshCw size={14} />
            <span>{t('mnRegenerate', lang)}</span>
          </button>
          {historyCount > 0 && (
            <>
              <div className="mn-export-divider" />
              <button className="mn-export-item" onClick={() => { setOpen(false); onHistory(); }}>
                <History size={14} />
                <span>{t('mnHistory', lang)}</span>
                <span className="meta" style={{ marginLeft: 'auto', fontSize: 11 }}>{historyCount}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Component ----

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

  // The note currently being displayed/edited
  const current = draft || saved;

  // --- Enter edit mode: create draft from saved ---
  const enterEditMode = () => {
    if (saved && !draft) {
      setDraft({ ...saved });
    }
    setEditing(true);
  };

  // --- Update helpers ---
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

  // --- Refine with AI ---
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

  // --- Save (from draft or edit) ---
  const handleSave = () => {
    if (!current) return;
    const toSave = { ...current, updatedAt: Date.now() };
    saveMasterNote(toSave);
    setSaved(toSave);
    setDraft(null);
    setEditing(false);
    showToast?.(t('mnSaved', lang), 'success');
  };

  // --- Cancel editing / discard draft ---
  const handleCancel = () => {
    setDraft(null);
    setEditing(false);
  };


  // --- Accept pending MasterNote update ---
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


  // --- Diff sections for pending note preview ---
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
                {/* Current */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('current', lang)}</div>
                  <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                    {saved?.overview || t('empty', lang)}
                  </div>
                </div>
                {/* Proposed */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>{t('proposed', lang)}</div>
                  <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--accent)' }}>
                    {pendingNote.overview || t('empty', lang)}
                  </div>
                </div>
              </div>

              {/* Show changed sections */}
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
        <div className="mn-history-overlay" onClick={() => { setHistoryOpen(false); setPreviewSnap(null); }}>
          <div className="mn-history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mn-history-header">
              <h3>{t('mnHistoryTitle', lang)}</h3>
              <button className="btn btn-ghost" onClick={() => { setHistoryOpen(false); setPreviewSnap(null); }} style={{ padding: '4px 8px', fontSize: 18 }}>×</button>
            </div>

            {snapshots.length === 0 ? (
              <div className="empty-state">
                <p>{t('mnHistoryEmpty', lang)}</p>
              </div>
            ) : (
              <div className="mn-history-content">
                {/* Version list */}
                <div className="mn-history-list">
                  {/* Current version */}
                  {saved && (
                    <div
                      className={`mn-history-item mn-history-item-current${!previewSnap ? ' active' : ''}`}
                      onClick={() => setPreviewSnap(null)}
                    >
                      <div className="mn-history-item-version">
                        v{snapshots.length + 1}
                        <span className="mn-history-badge-current">{t('mnHistoryCurrent', lang)}</span>
                      </div>
                      <div className="mn-history-item-date">
                        {new Date(saved.updatedAt).toLocaleString()}
                      </div>
                      <div className="mn-history-item-preview">
                        {saved.overview ? truncate(saved.overview, 60) : '—'}
                      </div>
                    </div>
                  )}
                  {/* Past versions */}
                  {snapshots.map((snap) => (
                    <div
                      key={snap.version}
                      className={`mn-history-item${previewSnap?.version === snap.version ? ' active' : ''}`}
                      onClick={() => setPreviewSnap(snap)}
                    >
                      <div className="mn-history-item-version">v{snap.version}</div>
                      <div className="mn-history-item-date">
                        {new Date(snap.savedAt).toLocaleString()}
                      </div>
                      <div className="mn-history-item-preview">
                        {snap.note.overview ? truncate(snap.note.overview, 60) : '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Preview area */}
                <div className="mn-history-detail">
                  {previewSnap ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>v{previewSnap.version}</div>
                          <div className="meta" style={{ fontSize: 11 }}>{new Date(previewSnap.savedAt).toLocaleString()}</div>
                        </div>
                        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => handleRestore(previewSnap.version)}>
                          {t('mnHistoryRestore', lang)}
                        </button>
                      </div>
                      <SnapshotPreview note={previewSnap.note} lang={lang} />
                    </>
                  ) : saved ? (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>v{snapshots.length + 1} <span className="mn-history-badge-current">{t('mnHistoryCurrent', lang)}</span></div>
                        <div className="meta" style={{ fontSize: 11 }}>{new Date(saved.updatedAt).toLocaleString()}</div>
                      </div>
                      <SnapshotPreview note={saved} lang={lang} />
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmRestoreVersion !== null && (
        <ConfirmDialog
          title={t('mnHistoryRestore', lang)}
          description={t('mnHistoryRestoreConfirm', lang)}
          confirmLabel={t('mnHistoryRestore', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={executeRestore}
          onCancel={() => setConfirmRestoreVersion(null)}
          danger={false}
        />
      )}
    </div>
  );
}
