/* eslint-disable react-refresh/only-export-components */
import React, { useState, useRef, useEffect } from 'react';
import type { MasterNote, LogEntry, SourcedItem } from '../types';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { ExternalLink, Pencil, MoreVertical, Copy, Download, RefreshCw, History } from 'lucide-react';

// ---- Helpers ----

export function normalizeItems(raw: SourcedItem[] | string[]): SourcedItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'string') {
    return raw.filter((item): item is string => typeof item === 'string').map((text) => ({ text, sourceLogIds: [] }));
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

// ---- Read-only display ----

export function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <div className="content-card">
      <div className="content-card-header">{label}</div>
      <p className="text-body" style={{ lineHeight: 1.7, margin: 0 }}>
        {value || '\u00a0'}
      </p>
    </div>
  );
}

export function ReadOnlyList({
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
      <ul className="list-disc">
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

export function EditableText({
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

export function EditableList({
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
                  aria-label={label}
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

export function RelatedLogs({ logIds, logs, onOpenLog, lang }: { logIds: string[]; logs: LogEntry[]; onOpenLog: (id: string) => void; lang: Lang }) {
  if (logIds.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{t('mnRelatedLogs', lang)}</div>
      <div className="flex-col-gap-sm">
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

// ---- Three-dot menu ----

export function OverflowMenu({
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
}

/** Lightweight inline markdown renderer for AI Context preview */
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
      result.push(<div key={`blank-${i}`} className="md-blank" />);
      i++;
      continue;
    }

    if (/^## /.test(line)) {
      result.push(
        <div key={`h2-${i}`} className="md-h2">
          {inlineBold(line.replace(/^## /, ''), `h2-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    if (/^### /.test(line)) {
      result.push(
        <div key={`h3-${i}`} className="md-h3">
          {inlineBold(line.replace(/^### /, ''), `h3-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    if (/^[-*] /.test(line)) {
      result.push(
        <div key={`li-${i}`} className="md-li">
          <span className="shrink-0">{'\u2022'}</span>
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
