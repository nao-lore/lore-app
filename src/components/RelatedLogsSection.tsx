import { useState, useRef, useEffect } from 'react';
import { linkLogs, unlinkLogs } from '../storage';
import { ExternalLink, X, Link } from 'lucide-react';
import type { LogEntry } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { formatDateFull } from '../utils/dateFormat';

const formatDateUnified = formatDateFull;

function RelatedLogsSection({ log, onOpenLog, lang, allLogs }: { log: LogEntry; onOpenLog: (id: string) => void; lang: Lang; allLogs: LogEntry[] }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setRefreshKey] = useState(0); // triggers re-render on link/unlink
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Explicitly linked logs (bidirectional backlinks)
  const currentLog = allLogs.find((l) => l.id === log.id);
  const linkedIds = currentLog?.relatedLogIds || [];
  const linkedLogs = linkedIds
    .map((lid) => allLogs.find((l) => l.id === lid))
    .filter((l): l is LogEntry => !!l);

  // Same-project logs (excluding current and already-linked)
  const linkedIdSet = new Set(linkedIds);
  const projectLogs = log.projectId
    ? allLogs
        .filter((l) => l.projectId === log.projectId && l.id !== log.id && !linkedIdSet.has(l.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8)
    : [];

  // Search candidates (all logs except current and already linked)
  const searchCandidates = searchQuery.trim()
    ? allLogs
        .filter((l) => l.id !== log.id && !linkedIdSet.has(l.id))
        .filter((l) => l.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 10)
    : [];

  const handleLink = (targetId: string) => {
    linkLogs(log.id, targetId);
    setSearchQuery('');
    setSearchOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const handleUnlink = (targetId: string) => {
    unlinkLogs(log.id, targetId);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Close search dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: MouseEvent) => {
      const container = document.querySelector('[data-related-search]');
      if (container && e.target instanceof Node && !container.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [searchOpen]);

  const hasLinked = linkedLogs.length > 0;
  const hasProject = projectLogs.length > 0;
  const showSection = hasLinked || hasProject;

  return (
    <div className="content-card">
      <div className="flex justify-between items-center" style={{ marginBottom: showSection ? 8 : 0 }}>
        <div className="content-card-header no-margin">{t('relatedLogs', lang)}</div>
        <div className="relative" data-related-search>
          <button
            className="btn btn-toolbar"
            onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); }}
            style={{ minHeight: 24 }}
          >
            <Link size={12} />
            {t('linkLog', lang)}
          </button>
          {searchOpen && (
            <div className="search-dropdown-panel">
              <div className="search-dropdown-pad">
                <input
                  ref={searchInputRef}
                  className="input w-full pad-6-10 fs-13"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchLogs', lang)}
                  aria-label={t('ariaSearchLogs', lang)}
                />
              </div>
              <div className="search-dropdown-scroll">
                {searchQuery.trim() && searchCandidates.length === 0 && (
                  <div className="text-placeholder search-empty-msg">
                    {t('noMatches', lang)}
                  </div>
                )}
                {searchCandidates.map((c) => (
                  <button
                    key={c.id}
                    className="search-candidate-btn"
                    onClick={() => handleLink(c.id)}
                  >
                    <span className={`${c.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} shrink-0`}>
                      {c.outputMode === 'handoff' ? 'H' : 'L'}
                    </span>
                    <span className="truncate flex-1">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explicitly linked logs */}
      {hasLinked && (
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: hasProject ? 12 : 0 }}>
          {linkedLogs.map((r) => (
            <span key={r.id} className="linked-log-chip">
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? 'H' : 'L'}
              </span>
              <span
                className="linked-log-chip-title"
                onClick={() => onOpenLog(r.id)}
                title={r.title}
              >
                {r.title}
              </span>
              <button
                onClick={() => handleUnlink(r.id)}
                title={t('unlink', lang)}
                className="unlink-btn"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Same-project logs */}
      {hasProject && (
        <div className="flex-col-gap-sm related-gap-2">
          {projectLogs.map((r) => (
            <button
              key={r.id}
              className="log-link-item"
              onClick={() => onOpenLog(r.id)}
            >
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? '🔁' : '📝'}
              </span>
              <span className="log-link-title">{r.title}</span>
              <span className="meta shrink-0 fs-11">
                {formatDateUnified(r.createdAt)}
              </span>
              <ExternalLink size={11} className="text-placeholder shrink-0" />
            </button>
          ))}
        </div>
      )}

      {!showSection && (
        <p className="meta fs-13 no-margin">
          {t('noMatches', lang)}
        </p>
      )}
    </div>
  );
}

export default RelatedLogsSection;
