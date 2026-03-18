import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FileText, ArrowRight } from 'lucide-react';
import type { Project, LogEntry } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getMasterNote } from './storage';
import DropdownMenu from './DropdownMenu';

function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

interface ProjectSummaryListViewProps {
  projects: Project[];
  logs: LogEntry[];
  onBack: () => void;
  onOpenSummary: (projectId: string) => void;
  lang: Lang;
}

type SummarySortKey = 'updated_desc' | 'updated_asc' | 'name';

export default function ProjectSummaryListView({ projects, logs, onBack, onOpenSummary, lang }: ProjectSummaryListViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SummarySortKey>('updated_desc');
  const [filterUnreflected, setFilterUnreflected] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click or Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (pickerRef.current && e.target instanceof Node && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  const logCountFor = (pid: string) => logs.filter((l) => l.projectId === pid).length;

  const countUnreflectedHandoffs = useCallback((projectId: string, noteUpdatedAt: number) =>
    logs.filter((l) => l.projectId === projectId && l.outputMode === 'handoff' && new Date(l.createdAt).getTime() > noteUpdatedAt).length,
  [logs]);

  // Only projects that have a summary
  const withSummaryRaw = useMemo(() =>
    projects
      .map((p) => ({ project: p, note: getMasterNote(p.id) }))
      .filter((x): x is { project: Project; note: NonNullable<ReturnType<typeof getMasterNote>> } => !!x.note),
    [projects],
  );

  const withSummary = useMemo(() => {
    let items = [...withSummaryRaw];
    if (filterUnreflected) {
      items = items.filter((x) => countUnreflectedHandoffs(x.project.id, x.note.updatedAt) > 0);
    }
    switch (sortKey) {
      case 'updated_asc':
        items.sort((a, b) => a.note.updatedAt - b.note.updatedAt);
        break;
      case 'name':
        items.sort((a, b) => a.project.name.localeCompare(b.project.name));
        break;
      case 'updated_desc':
      default:
        items.sort((a, b) => b.note.updatedAt - a.note.updatedAt);
    }
    return items;
  }, [withSummaryRaw, sortKey, filterUnreflected, countUnreflectedHandoffs]);

  // Projects without a summary (for the picker)
  const withoutSummary = projects.filter((p) => !getMasterNote(p.id));

  const sortOptions = [
    { key: 'updated_desc', label: t('sortUpdatedDesc', lang) },
    { key: 'updated_asc', label: t('sortUpdatedAsc', lang) },
    { key: 'name', label: t('sortProjectName', lang) },
  ];

  return (
    <div className="workspace-content-wide">
      <div className="page-header">
        <button className="btn-back mb-md" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <div className="flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2>{t('projectSummaryListTitle', lang)}</h2>
            <p className="page-subtitle">{t('projectSummaryListDesc', lang)}</p>
          </div>
          {projects.length > 0 && (
            <div ref={pickerRef} className="relative">
              <button
                className="btn btn-primary fs-13"
                onClick={() => setPickerOpen(!pickerOpen)}
              >
                {t('projectSummaryNew', lang)}
              </button>
              {pickerOpen && (
                <div className="dropdown-menu min-w-240">
                  <div style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {t('projectSummarySelectProject', lang)}
                  </div>
                  {withoutSummary.length === 0 ? (
                    <div style={{ padding: '8px 14px', fontSize: 13, color: 'var(--text-placeholder)' }}>
                      {t('allProjectsHaveSummaries', lang)}
                    </div>
                  ) : (
                    withoutSummary.map((p) => (
                      <button
                        key={p.id}
                        className="mn-export-item"
                        onClick={() => { setPickerOpen(false); onOpenSummary(p.id); }}
                      >
                        <FileText size={14} />
                        <span>{p.name}</span>
                        <span className="meta" style={{ marginLeft: 'auto', fontSize: 11 }}>
                          {tf('logCount', lang, logCountFor(p.id))}
                        </span>
                      </button>
                    ))
                  )}
                  {withSummary.length > 0 && (
                    <>
                      <div className="mn-export-divider" />
                      {withSummary.map(({ project: p }) => (
                        <button
                          key={p.id}
                          className="mn-export-item"
                          onClick={() => { setPickerOpen(false); onOpenSummary(p.id); }}
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <FileText size={14} />
                          <span>{p.name}</span>
                          <span className="meta" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--success-text)' }}>
                            {t('projectSummaryExists', lang)}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toolbar: sort + filter */}
      {withSummaryRaw.length > 0 && (
        <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <DropdownMenu
            label={t('sortLabel', lang)}
            value={sortKey}
            options={sortOptions}
            onChange={(k) => setSortKey(k as SummarySortKey)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={filterUnreflected}
              onChange={(e) => setFilterUnreflected(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            {t('hasUnreflectedHandoffs', lang)}
          </label>
        </div>
      )}

      {withSummary.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128196;</div>
          <p>{t('projectSummaryNoSummaries', lang)}</p>
          <p className="page-subtitle">{t('projectSummaryNoSummariesDesc', lang)}</p>
          {projects.length > 0 && (
            <button className="btn btn-primary mt-md" onClick={() => setPickerOpen(true)}>
              {t('projectSummaryNew', lang)}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-col-gap-8">
          {withSummary.map(({ project: p, note }) => {
            const count = logCountFor(p.id);
            const unreflected = countUnreflectedHandoffs(p.id, note.updatedAt);
            const days = daysSince(note.updatedAt);
            const isStale = days >= 7 && unreflected > 0;
            return (
              <button
                type="button"
                key={p.id}
                className="card card-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', borderLeft: isStale ? '3px solid var(--warning-text)' : undefined, textAlign: 'left', width: '100%' }}
                onClick={() => onOpenSummary(p.id)}
                aria-label={`${t('ariaOpenSummary', lang)}: ${p.name}`}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: unreflected > 0 ? 'var(--warning-bg)' : 'var(--success-bg)',
                  border: `1px solid ${unreflected > 0 ? 'var(--warning-border)' : 'var(--success-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileText size={16} style={{ color: unreflected > 0 ? 'var(--warning-text)' : 'var(--success-text)' }} />
                </div>
                <div className="flex-1">
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 2 }}>
                    {p.name}
                  </div>
                  <div className="meta" style={{ fontSize: 11, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{tf('logCount', lang, count)}</span>
                    <span>{tf('mnUpdatedAt', lang, new Date(note.updatedAt).toLocaleDateString())}</span>
                    {days > 0 && (
                      <span style={{ color: days >= 7 ? 'var(--warning-text)' : 'var(--text-placeholder)' }}>
                        ({tf('daysAgo', lang, days)})
                      </span>
                    )}
                  </div>
                  {note.overview && (
                    <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '6px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {note.overview}
                    </p>
                  )}
                  {unreflected > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      <span>⚠</span>
                      <span>
                        {tf('unreflectedHandoffWarning', lang, unreflected)}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    className={unreflected > 0 ? 'btn btn-primary' : 'btn'}
                    style={{ fontSize: 12, padding: '4px 10px', minHeight: 24, display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={(e) => { e.stopPropagation(); onOpenSummary(p.id); }}
                  >
                    {unreflected > 0
                      ? t('updateBtn', lang)
                      : t('openBtn', lang)}
                    <ArrowRight size={12} />
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
