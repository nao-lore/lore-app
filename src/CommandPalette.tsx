import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ScrollText, FolderOpen, CheckSquare, BookOpen } from 'lucide-react';
import type { LogEntry, Project, MasterNote } from './types';
import { loadTodos } from './storage';
import { search } from './search';
import type { SearchResult } from './search';
import { t } from './i18n';
import type { Lang } from './i18n';

interface CommandPaletteProps {
  logs: LogEntry[];
  projects: Project[];
  masterNotes: MasterNote[];
  onSelectLog: (id: string) => void;
  onSelectProject: (id: string) => void;
  onSelectSummary: (projectId: string) => void;
  onClose: () => void;
  lang: Lang;
}

export default function CommandPalette({ logs, projects, masterNotes, onSelectLog, onSelectProject, onSelectSummary, onClose, lang }: CommandPaletteProps) {
  const [query, setQueryRaw] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const setQuery = useCallback((q: string) => { setQueryRaw(q); setSelectedIndex(0); }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const todos = useMemo(() => loadTodos(), []);

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim();
    if (!q) {
      // Show recent logs when empty
      return logs.slice(0, 8).map((l) => ({
        type: 'log' as const,
        id: l.id,
        title: l.title,
        subtitle: l.outputMode === 'handoff' ? 'Handoff' : 'Worklog',
      }));
    }

    return search(q, { logs, projects, todos, masterNotes, projectMap }, 30);
  }, [query, logs, projects, todos, masterNotes, projectMap]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = (r: SearchResult) => {
    if (r.type === 'log') onSelectLog(r.id);
    else if (r.type === 'project') onSelectProject(r.id);
    else if (r.type === 'summary' && r.targetId) onSelectSummary(r.targetId);
    else if (r.type === 'todo' && r.targetId) onSelectLog(r.targetId);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const TypeIcon = ({ type, id }: { type: string; id: string }) => {
    if (type === 'project') {
      const proj = projectMap.get(id);
      if (proj?.icon) return <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{proj.icon}</span>;
      return <FolderOpen size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />;
    }
    if (type === 'todo') return <CheckSquare size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />;
    if (type === 'summary') return <BookOpen size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />;
    return <ScrollText size={14} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />;
  };

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-container" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('searchPlaceholder', lang)}
        />
        <div className="palette-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="palette-empty">{t('searchNoResults', lang)}</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                className={`palette-item${i === selectedIndex ? ' active' : ''}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <TypeIcon type={r.type} id={r.id} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="palette-item-title">{r.title}</span>
                    {r.subtitle && <span className="palette-item-meta">{r.subtitle}</span>}
                  </div>
                  {r.snippet && (
                    <span className="palette-item-snippet">{r.snippet}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
