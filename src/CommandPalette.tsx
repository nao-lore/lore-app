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

  const logMap = useMemo(() => {
    const m = new Map<string, LogEntry>();
    for (const l of logs) m.set(l.id, l);
    return m;
  }, [logs]);

  /** Build a content preview (~80 chars) from a log's fields */
  const getContentPreview = useCallback((log: LogEntry): string | undefined => {
    const parts = [
      ...log.today,
      ...log.decisions,
      ...log.todo,
      ...(log.currentStatus || []),
      ...(log.nextActions || []),
      ...(log.completed || []),
    ];
    const joined = parts.filter(Boolean).join(' / ');
    if (!joined) return undefined;
    return joined.length > 80 ? joined.slice(0, 80) + '...' : joined;
  }, []);

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

  const typeBadgeConfig: Record<string, { label: string; color: string; bg: string }> = {
    log: { label: 'Worklog', color: 'var(--text-placeholder)', bg: 'var(--bg-surface)' },
    handoff: { label: 'Handoff', color: 'var(--accent-text)', bg: 'var(--bg-surface)' },
    project: { label: 'Project', color: 'var(--accent-text)', bg: 'var(--bg-surface)' },
    todo: { label: 'Todo', color: 'var(--success-text)', bg: 'var(--bg-surface)' },
    summary: { label: 'Summary', color: 'var(--success-text)', bg: 'var(--bg-surface)' },
  };

  const getTypeBadgeKey = (r: SearchResult): string => {
    if (r.type === 'log') {
      const log = logMap.get(r.id);
      return log?.outputMode === 'handoff' ? 'handoff' : 'log';
    }
    return r.type;
  };

  const TypeBadge = ({ badgeKey }: { badgeKey: string }) => {
    const cfg = typeBadgeConfig[badgeKey] || typeBadgeConfig.log;
    return (
      <span style={{
        fontSize: 10,
        color: cfg.color,
        background: cfg.bg,
        padding: '1px 6px',
        borderRadius: 3,
        flexShrink: 0,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}>
        {cfg.label}
      </span>
    );
  };

  const ProjectLabel = ({ projectId }: { projectId?: string }) => {
    if (!projectId) return null;
    const proj = projectMap.get(projectId);
    if (!proj) return null;
    return (
      <span style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        background: 'var(--bg-surface)',
        padding: '1px 6px',
        borderRadius: 3,
        flexShrink: 0,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}>
        {proj.icon ? `${proj.icon} ` : ''}{proj.name}
      </span>
    );
  };

  /** Resolve the projectId for a search result */
  const getProjectId = (r: SearchResult): string | undefined => {
    if (r.type === 'log') return logMap.get(r.id)?.projectId;
    if (r.type === 'summary') return r.targetId;
    if (r.type === 'todo' && r.targetId) return logMap.get(r.targetId)?.projectId;
    return undefined;
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
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="palette-listbox"
          aria-activedescendant={results.length > 0 ? `palette-option-${selectedIndex}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('searchPlaceholder', lang)}
          maxLength={200}
        />
        <div className="palette-results" ref={listRef} id="palette-listbox" role="listbox" aria-label={t('searchPlaceholder', lang)}>
          {results.length === 0 ? (
            <div className="palette-empty">{t('searchNoResults', lang)}</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                id={`palette-option-${i}`}
                role="option"
                aria-selected={i === selectedIndex}
                className={`palette-item${i === selectedIndex ? ' active' : ''}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <TypeIcon type={r.type} id={r.id} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="palette-item-title">{r.title}</span>
                    <TypeBadge badgeKey={getTypeBadgeKey(r)} />
                    <ProjectLabel projectId={getProjectId(r)} />
                  </div>
                  {r.snippet && (
                    <span className="palette-item-snippet">{r.snippet}</span>
                  )}
                  {r.type === 'log' && (() => {
                    const log = logMap.get(r.id);
                    if (!log) return null;
                    const preview = getContentPreview(log);
                    if (!preview || preview === r.snippet) return null;
                    return (
                      <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                        display: 'block',
                      }}>{preview}</span>
                    );
                  })()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
