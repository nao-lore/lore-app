import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { LogEntry, MasterNote, MasterNoteSnapshot } from '../types';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { getMasterNote, saveMasterNote, getMasterNoteHistory, restoreMasterNoteSnapshot, saveAiContext } from '../storage';
import { generateMasterNote, refineMasterNote } from '../masterNote';
import { generateProjectContext } from '../generateProjectContext';
import { formatFullAiContext } from '../formatHandoff';
import type { GenerateProgress } from '../masterNote';

interface UseMasterNoteActionsArgs {
  projectId: string;
  projectName: string;
  logs: LogEntry[];
  latestHandoff?: LogEntry;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export function useMasterNoteActions({
  projectId, projectName, logs, latestHandoff, lang, showToast,
}: UseMasterNoteActionsArgs) {
  const [saved, setSaved] = useState<MasterNote | undefined>(() => getMasterNote(projectId));
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
  const [historySnapshots, setHistorySnapshots] = useState<MasterNoteSnapshot[]>(() => getMasterNoteHistory(projectId));
  const [previewSnap, setPreviewSnap] = useState<MasterNoteSnapshot | null>(null);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<number | null>(null);
  const [pendingNote, setPendingNote] = useState<MasterNote | null>(null);

  const projectLogs = logs.filter((l) => l.projectId === projectId);

  const aiContext = useMemo(() => {
    if (!saved) return '';
    const ctx = generateProjectContext(saved, logs, projectName);
    return formatFullAiContext(ctx, latestHandoff);
  }, [saved, latestHandoff, logs, projectName]);

  useEffect(() => {
    if (aiContext) saveAiContext(projectId, aiContext);
  }, [aiContext, projectId]);

  const current = draft || saved;
  const hasDraft = draft !== null;
  const hasPending = pendingNote !== null;
  const isProcessing = loading || refining;

  const enterEditMode = useCallback(() => {
    if (saved && !draft) setDraft({ ...saved });
    setEditing(true);
  }, [saved, draft]);

  const updateDraft = useCallback((updates: Partial<MasterNote>) => {
    if (!current) return;
    setDraft({ ...current, ...updates });
  }, [current]);

  const generatingRef = useRef(false);
  const handleGenerate = useCallback(async () => {
    if (generatingRef.current) {
      if (import.meta.env.DEV) console.warn('[MasterNote] handleGenerate already running');
      return;
    }
    generatingRef.current = true;
    setLoading(true); setError(null); setProgress(null); setSimStep(0);
    try {
      const proposed = await generateMasterNote(projectId, projectLogs, saved, (p) => {
        setProgress(p);
        if (p.phase === 'extract') setSimStep(p.current <= 1 ? 0 : 1);
        else setSimStep(2);
      });
      setSimStep(4);
      setPendingNote(proposed);
      setEditing(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast?.(t('failed', lang), 'error');
    } finally {
      generatingRef.current = false;
      setLoading(false); setProgress(null);
    }
  }, [projectId, projectLogs, saved, lang, showToast]);

  const handleRefine = useCallback(async () => {
    if (!current || !refineText.trim()) return;
    setRefining(true); setRefineOpen(false); setError(null);
    try {
      const refined = await refineMasterNote(current, refineText.trim());
      setPendingNote(refined); setEditing(false); setRefineText('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      showToast?.(t('failed', lang), 'error');
    } finally { setRefining(false); }
  }, [current, refineText, lang, showToast]);

  const handleSave = useCallback(() => {
    if (!current) return;
    const toSave = { ...current, updatedAt: Date.now() };
    saveMasterNote(toSave); setSaved(toSave); setDraft(null); setEditing(false);
    showToast?.(t('mnSaved', lang), 'success');
  }, [current, lang, showToast]);

  const handleCancel = useCallback(() => { setDraft(null); setEditing(false); }, []);

  const handleAccept = useCallback(() => {
    if (!pendingNote) return;
    const toSave = { ...pendingNote, updatedAt: Date.now() };
    saveMasterNote(toSave); setSaved(toSave); setDraft(null); setPendingNote(null); setEditing(false);
    showToast?.(t('masterNoteUpdated', lang), 'success');
    setHistorySnapshots(getMasterNoteHistory(projectId));
  }, [pendingNote, lang, showToast, projectId]);

  const openHistory = useCallback(() => {
    setHistorySnapshots(getMasterNoteHistory(projectId));
    setHistoryOpen(true); setPreviewSnap(null);
  }, [projectId]);

  const executeRestore = useCallback(() => {
    if (confirmRestoreVersion === null) return;
    const restored = restoreMasterNoteSnapshot(projectId, confirmRestoreVersion);
    if (restored) {
      setSaved(restored); setDraft(null); setEditing(false); setHistoryOpen(false);
      setPreviewSnap(null); setConfirmRestoreVersion(null);
      showToast?.(t('mnHistoryRestored', lang), 'success');
    }
  }, [confirmRestoreVersion, projectId, lang, showToast]);

  return {
    saved, draft, editing, loading, refining, progress, simStep, error,
    refineOpen, setRefineOpen, refineText, setRefineText,
    historyOpen, setHistoryOpen, historySnapshots, previewSnap, setPreviewSnap,
    confirmRestoreVersion, setConfirmRestoreVersion, pendingNote, setPendingNote,
    projectLogs, aiContext, current, hasDraft, hasPending, isProcessing,
    enterEditMode, updateDraft, handleGenerate, handleRefine,
    handleSave, handleCancel, handleAccept, openHistory, executeRestore,
  };
}
