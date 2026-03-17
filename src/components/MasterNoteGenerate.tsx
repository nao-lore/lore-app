import React, { useState, useRef, useEffect } from 'react';
import type { MasterNote, SourcedItem } from '../types';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { MoreVertical, Pencil, Copy, Download, RefreshCw, History } from 'lucide-react';

// ─── Helpers shared with MasterNoteView ───

export function normalizeItems(raw: SourcedItem[] | string[]): SourcedItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((text) => ({ text, sourceLogIds: [] }));
  }
  return raw as SourcedItem[];
}

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

export function OverflowMenu({
  note, projectName, lang, showToast,
  onEdit, onRefine, onRegenerate, onHistory,
  disabled, historyCount,
}: OverflowMenuProps) {
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

// ─── Pending note diff preview ───
interface PendingNotePreviewProps {
  lang: Lang;
  saved: MasterNote | null | undefined;
  pendingNote: MasterNote;
  onAccept: () => void;
  onReject: () => void;
}

export function PendingNotePreview({ lang, saved, pendingNote, onAccept, onReject }: PendingNotePreviewProps) {
  const sections = [
    { label: t('mnDecisions', lang), current: saved?.decisions?.map((d) => d.text) || [], pending: pendingNote.decisions?.map((d) => d.text) || [] },
    { label: t('mnOpenIssues', lang), current: saved?.openIssues?.map((d) => d.text) || [], pending: pendingNote.openIssues?.map((d) => d.text) || [] },
    { label: t('mnNextActions', lang), current: saved?.nextActions?.map((d) => d.text) || [], pending: pendingNote.nextActions?.map((d) => d.text) || [] },
  ];

  return (
    <div className="content-card" style={{ marginBottom: 20, border: '2px solid var(--accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('pendingUpdate', lang)}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={onAccept}>
            {t('accept', lang)}
          </button>
          <button className="btn" onClick={onReject}>
            {t('reject', lang)}
          </button>
        </div>
      </div>

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

      {sections.map((sec) => {
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
      })}
    </div>
  );
}

// ─── Inline markdown renderer ───
export function renderSimpleMarkdown(text: string): React.ReactNode[] {
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

    if (line.trim() === '') {
      result.push(<div key={`blank-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    if (/^## /.test(line)) {
      result.push(
        <div key={`h2-${i}`} style={{ fontWeight: 700, fontSize: 14, marginTop: 8, marginBottom: 2 }}>
          {inlineBold(line.replace(/^## /, ''), `h2-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    if (/^### /.test(line)) {
      result.push(
        <div key={`h3-${i}`} style={{ fontWeight: 700, fontSize: 13, marginTop: 6, marginBottom: 2 }}>
          {inlineBold(line.replace(/^### /, ''), `h3-${i}`)}
        </div>
      );
      i++;
      continue;
    }

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

    result.push(
      <div key={`p-${i}`}>{inlineBold(line, `p-${i}`)}</div>
    );
    i++;
  }

  return result;
}
