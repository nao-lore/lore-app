import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ScrollText, FolderOpen, CheckSquare, BookOpen, Terminal } from 'lucide-react';
import type { LogEntry, Project, MasterNote } from './types';
import { loadTodos } from './storage';
import { search } from './search';
import type { SearchResult } from './search';
import { t } from './i18n';
import type { Lang } from './i18n';
import { useFocusTrap } from './useFocusTrap';
import type { View } from './App';

interface ActionCommand {
  id: string;
  label: string;
  keywords: string[];
  action: () => void;
}

interface CommandPaletteProps {
  logs: LogEntry[];
  projects: Project[];
  masterNotes: MasterNote[];
  onSelectLog: (id: string) => void;
  onSelectProject: (id: string) => void;
  onSelectSummary: (projectId: string) => void;
  onClose: () => void;
  lang: Lang;
  // Action command callbacks (optional)
  onNavigate?: (view: View) => void;
  onToggleTheme?: (theme: 'light' | 'dark') => void;
  onNewProject?: () => void;
}

export default function CommandPalette({ logs, projects, masterNotes, onSelectLog, onSelectProject, onSelectSummary, onClose, lang, onNavigate, onToggleTheme, onNewProject }: CommandPaletteProps) {
  const [query, setQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const setQuery = useCallback((q: string) => { setQueryRaw(q); setSelectedIndex(0); }, []);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search input by 150ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);
  const listRef = useRef<HTMLDivElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

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

  // --- Action commands mode (triggered by ">" prefix) ---
  const isCommandMode = query.startsWith('>');

  const actionCommands = useMemo((): ActionCommand[] => {
    const cmds: ActionCommand[] = [];
    if (onNewProject) {
      cmds.push({ id: 'cmd-new-project', label: 'New Project', keywords: ['new', 'project', 'create'], action: onNewProject });
    }
    if (onToggleTheme) {
      cmds.push({ id: 'cmd-dark-mode', label: 'Toggle Dark Mode', keywords: ['dark', 'mode', 'theme', 'toggle'], action: () => onToggleTheme('dark') });
      cmds.push({ id: 'cmd-light-mode', label: 'Toggle Light Mode', keywords: ['light', 'mode', 'theme', 'toggle'], action: () => onToggleTheme('light') });
    }
    if (onNavigate) {
      cmds.push({ id: 'cmd-open-settings', label: 'Open Settings', keywords: ['settings', 'preferences', 'config', 'open'], action: () => onNavigate('settings') });
      cmds.push({ id: 'cmd-open-dashboard', label: 'Open Dashboard', keywords: ['dashboard', 'home', 'open'], action: () => onNavigate('dashboard') });
    }
    return cmds;
  }, [onNewProject, onToggleTheme, onNavigate]);

  const filteredCommands = useMemo((): ActionCommand[] => {
    if (!isCommandMode) return [];
    const cmdQuery = debouncedQuery.slice(1).trim().toLowerCase();
    if (!cmdQuery) return actionCommands;
    return actionCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(cmdQuery) ||
      cmd.keywords.some((kw) => kw.includes(cmdQuery))
    );
  }, [isCommandMode, debouncedQuery, actionCommands]);

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
    if (isCommandMode) return []; // Commands handled separately
    const q = debouncedQuery.trim();
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
  }, [debouncedQuery, isCommandMode, logs, projects, todos, masterNotes, projectMap]);

  // Unified item count for keyboard navigation
  const totalItems = isCommandMode ? filteredCommands.length : results.length;

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

  const handleCommandSelect = (cmd: ActionCommand) => {
    cmd.action();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isCommandMode) {
        if (filteredCommands[selectedIndex]) handleCommandSelect(filteredCommands[selectedIndex]);
      } else {
        if (results[selectedIndex]) handleSelect(results[selectedIndex]);
      }
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
      <span className="cp-type-badge" style={{ color: cfg.color, background: cfg.bg }}>
        {cfg.label}
      </span>
    );
  };

  const ProjectLabel = ({ projectId }: { projectId?: string }) => {
    if (!projectId) return null;
    const proj = projectMap.get(projectId);
    if (!proj) return null;
    return (
      <span className="cp-type-badge" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
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
      if (proj?.icon) return <span className="shrink-0" style={{ fontSize: 14, lineHeight: 1 }}>{proj.icon}</span>;
      return <FolderOpen size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />;
    }
    if (type === 'todo') return <CheckSquare size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />;
    if (type === 'summary') return <BookOpen size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />;
    return <ScrollText size={14} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />;
  };

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div ref={trapRef} className="palette-container" role="dialog" aria-modal="true" aria-label={t('searchPlaceholder', lang)} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          role="combobox"
          aria-expanded={totalItems > 0}
          aria-controls="palette-listbox"
          aria-activedescendant={totalItems > 0 ? `palette-option-${selectedIndex}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('ariaSearch', lang)}
          placeholder={t('searchPlaceholder', lang)}
          maxLength={200}
        />
        <div className="palette-results" ref={listRef} id="palette-listbox" role="listbox" aria-label={t('searchPlaceholder', lang)}>
          {isCommandMode ? (
            filteredCommands.length === 0 ? (
              <div className="palette-empty">{t('searchNoResults', lang)}</div>
            ) : (
              filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  id={`palette-option-${i}`}
                  role="option"
                  aria-selected={i === selectedIndex}
                  className={`palette-item${i === selectedIndex ? ' active' : ''}`}
                  onClick={() => handleCommandSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <Terminal size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
                  <div className="flex-1 flex-col">
                    <div className="flex-row-gap-2" style={{ gap: 6 }}>
                      <span className="palette-item-title">{cmd.label}</span>
                      <span className="cp-type-badge" style={{ color: 'var(--accent-text)', background: 'var(--bg-surface)' }}>
                        Command
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )
          ) : results.length === 0 ? (
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
                <div className="flex-1 flex-col">
                  <div className="flex-row-gap-2" style={{ gap: 6 }}>
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
                      <span className="cp-preview">{preview}</span>
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
