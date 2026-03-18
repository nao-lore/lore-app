import React, { useState, useRef, useEffect, memo } from 'react';
import type { MasterNote } from '../types';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { MoreVertical, Pencil, Copy, Download, RefreshCw, History } from 'lucide-react';
import { normalizeItems } from './masterNoteHelpers';

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

import { downloadFile } from '../utils/downloadFile';

// ─── Three-dot menu ───
interface OverflowMenuProps {
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
}

export const OverflowMenu = memo(function OverflowMenu({
  note, projectName, lang, showToast,
  onEdit, onRefine, onRegenerate, onHistory,
  disabled, historyCount,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
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
    <div ref={menuRef} className="relative">
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
                <span className="meta ml-auto" style={{ fontSize: 11 }}>{historyCount}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// ─── Pending note diff preview ───
interface PendingNotePreviewProps {
  lang: Lang;
  saved: MasterNote | null | undefined;
  pendingNote: MasterNote;
  onAccept: () => void;
  onReject: () => void;
}

export const PendingNotePreview = memo(function PendingNotePreview({ lang, saved, pendingNote, onAccept, onReject }: PendingNotePreviewProps) {
  const sections = [
    { label: t('mnDecisions', lang), current: saved?.decisions?.map((d) => d.text) || [], pending: pendingNote.decisions?.map((d) => d.text) || [] },
    { label: t('mnOpenIssues', lang), current: saved?.openIssues?.map((d) => d.text) || [], pending: pendingNote.openIssues?.map((d) => d.text) || [] },
    { label: t('mnNextActions', lang), current: saved?.nextActions?.map((d) => d.text) || [], pending: pendingNote.nextActions?.map((d) => d.text) || [] },
  ];

  return (
    <div className="content-card mb-xl" style={{ border: '2px solid var(--accent)' }}>
      <div className="flex justify-between items-center mb-md">
        <h3 className="modal-heading-sm">{t('pendingUpdate', lang)}</h3>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={onAccept}>
            {t('accept', lang)}
          </button>
          <button className="btn" onClick={onReject}>
            {t('reject', lang)}
          </button>
        </div>
      </div>

      <div className="diff-grid">
        <div>
          <div className="text-xs-muted" style={{ marginBottom: 4 }}>{t('current', lang)}</div>
          <div className="diff-panel">
            {saved?.overview || t('empty', lang)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>{t('proposed', lang)}</div>
          <div className="diff-panel" style={{ borderLeft: '3px solid var(--accent)' }}>
            {pendingNote.overview || t('empty', lang)}
          </div>
        </div>
      </div>

      {sections.map((sec) => {
        const added = sec.pending.filter((txt) => !sec.current.includes(txt));
        const removed = sec.current.filter((txt) => !sec.pending.includes(txt));
        if (added.length === 0 && removed.length === 0) return null;

        return (
          <div key={sec.label} className="mt-md">
            <div className="text-sm font-semibold" style={{ marginBottom: 4 }}>{sec.label}</div>
            {added.map((item, i) => (
              <div key={`a${i}`} className="diff-added">+ {item}</div>
            ))}
            {removed.map((item, i) => (
              <div key={`r${i}`} className="diff-removed">- {item}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
});

