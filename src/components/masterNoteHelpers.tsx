import React from 'react';
import type { SourcedItem } from '../types';

export function normalizeItems(raw: SourcedItem[] | string[]): SourcedItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'string') {
    return raw.filter((item): item is string => typeof item === 'string').map((text) => ({ text, sourceLogIds: [] }));
  }
  return raw as SourcedItem[];
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
