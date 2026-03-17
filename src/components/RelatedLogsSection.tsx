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
      if (container && !container.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [searchOpen]);

  const hasLinked = linkedLogs.length > 0;
  const hasProject = projectLogs.length > 0;
  const showSection = hasLinked || hasProject;

  return (
    <div className="content-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSection ? 8 : 0 }}>
        <div className="content-card-header" style={{ margin: 0 }}>{t('relatedLogs', lang)}</div>
        <div style={{ position: 'relative' }} data-related-search>
          <button
            className="btn"
            style={{ fontSize: 12, padding: '2px 10px', minHeight: 24, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); }}
          >
            <Link size={12} />
            {t('linkLog', lang)}
          </button>
          {searchOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100,
              background: 'var(--card-bg)', border: '1px solid var(--border-default)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 'min(320px, calc(100vw - 40px))', maxHeight: 300, overflow: 'hidden',
            }}>
              <div style={{ padding: 8 }}>
                <input
                  ref={searchInputRef}
                  className="input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchLogs', lang)}
                  style={{ width: '100%', fontSize: 13, padding: '6px 10px' }}
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {searchQuery.trim() && searchCandidates.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-placeholder)' }}>
                    {t('noMatches', lang)}
                  </div>
                )}
                {searchCandidates.map((c) => (
                  <button
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontSize: 13, color: 'var(--text-body)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    onClick={() => handleLink(c.id)}
                  >
                    <span className={c.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} style={{ flexShrink: 0 }}>
                      {c.outputMode === 'handoff' ? 'H' : 'L'}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explicitly linked logs */}
      {hasLinked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasProject ? 12 : 0 }}>
          {linkedLogs.map((r) => (
            <span
              key={r.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 16,
                background: 'var(--accent-bg, #f3f0ff)', fontSize: 13,
                border: '1px solid var(--border-default)',
              }}
            >
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? 'H' : 'L'}
              </span>
              <span
                style={{ cursor: 'pointer', color: 'var(--accent-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => onOpenLog(r.id)}
                title={r.title}
              >
                {r.title}
              </span>
              <button
                onClick={() => handleUnlink(r.id)}
                title={t('unlink', lang)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--text-placeholder)', borderRadius: '50%', width: 18, height: 18,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger-text, #e53e3e)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-placeholder)')}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Same-project logs */}
      {hasProject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              <span className="meta" style={{ fontSize: 11, flexShrink: 0 }}>
                {formatDateUnified(r.createdAt)}
              </span>
              <ExternalLink size={11} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {!showSection && (
        <p className="meta" style={{ fontSize: 13, margin: 0 }}>
          {t('noMatches', lang)}
        </p>
      )}
    </div>
  );
}

export default RelatedLogsSection;
