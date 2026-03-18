import type { ReactNode } from 'react';
import { Pin, Copy, Check, Activity, MoreVertical } from 'lucide-react';
import { loadLogs, updateLog, getFeatureEnabled } from '../storage';
import { WORKLOAD_CONFIG } from '../workload';
import { formatDateTimeFull } from '../utils/dateFormat';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { LogEntry, Project } from '../types';

interface DetailHeaderProps {
  log: LogEntry;
  project: Project | undefined;
  isHandoff: boolean;
  lang: Lang;
  editingTitle: boolean;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  setEditingTitle: (v: boolean) => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  showSaved: boolean;
  analyzingWorkload: boolean;
  onAnalyzeWorkload: () => void;
  onCopyWithContext: () => void;
  onMenuToggle: () => void;
  menuOpen: boolean;
  menuContent?: ReactNode;
  onBack: () => void;
  onRefresh: () => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  onOpenMasterNote?: (projectId: string) => void;
}

export default function DetailHeader({
  log, project, isHandoff, lang,
  editingTitle, titleDraft, setTitleDraft, setEditingTitle,
  onTitleSave, onTitleCancel, showSaved,
  analyzingWorkload, onAnalyzeWorkload,
  onCopyWithContext, onMenuToggle, menuOpen: _menuOpen, menuContent,
  onBack, onRefresh, showToast, onOpenMasterNote,
}: DetailHeaderProps) {
  return (
    <div className="page-header">
      <nav className="flex-row flex-wrap mb-md detail-breadcrumb">
        <button
          type="button"
          className="text-muted cursor-pointer breadcrumb-btn"
          onClick={onBack}
          aria-label={t('ariaGoBack', lang)}
        >
          {t('logs', lang)}
        </button>
        {project && (
          <>
            <span className="breadcrumb-sep">{' › '}</span>
            {onOpenMasterNote ? (
              <button
                type="button"
                className="text-muted cursor-pointer breadcrumb-btn"
                onClick={() => onOpenMasterNote(project.id)}
                aria-label={t('ariaOpenSummary', lang)}
              >
                {project.icon && <span style={{ marginRight: 3 }}>{project.icon}</span>}
                {project.name}
              </button>
            ) : (
              <span className="text-muted">
                {project.icon && <span style={{ marginRight: 3 }}>{project.icon}</span>}
                {project.name}
              </span>
            )}
          </>
        )}
        <span className="breadcrumb-sep">{' › '}</span>
        <span
          className="breadcrumb-current"
          title={log.title}
        >
          {log.title}
        </span>
      </nav>
      <div className="page-header-row">
        <div className="flex-1">
          <div className="flex-row gap-10">
            {isHandoff ? <span className="badge-handoff">Handoff</span> : <span className="badge-worklog">Log</span>}
            {project && (
              <span
                className="tag detail-project-tag"
                onClick={() => onOpenMasterNote?.(project.id)}
                title={t('viewProjectSummary', lang)}
              >
                {project.icon && <span className="detail-project-icon">{project.icon}</span>}
                {project.name}
                <span className="detail-arrow-indicator">→</span>
              </span>
            )}
          </div>
          <div className="flex-row flex-wrap text-sm-muted mb-sm gap-12">
            <span>{t('logCreatedAt', lang)}：{formatDateTimeFull(log.createdAt)}</span>
            {log.updatedAt && <span>{t('logUpdatedAt', lang)}：{formatDateTimeFull(log.updatedAt)}</span>}
            {/* Workload level */}
            {!getFeatureEnabled('workload', true) ? null : log.workloadLevel ? (
              <span
                className="detail-workload-badge"
                style={{
                  color: WORKLOAD_CONFIG[log.workloadLevel].color,
                  background: WORKLOAD_CONFIG[log.workloadLevel].bg,
                }}
                onClick={onAnalyzeWorkload}
                title={t('clickToReanalyze', lang)}
              >
                <Activity size={10} />
                {t('workloadLevel', lang)}: {WORKLOAD_CONFIG[log.workloadLevel].label(lang)}
              </span>
            ) : (
              <button
                className="btn detail-workload-btn"
                onClick={onAnalyzeWorkload}
                disabled={analyzingWorkload}
              >
                <Activity size={10} />
                {analyzingWorkload ? t('workloadAnalyzing', lang) : t('workloadAnalyze', lang)}
              </button>
            )}
          </div>
          <div className="flex detail-title-area">
            {editingTitle ? (
              <input
                className="input detail-title-input"
                value={titleDraft}
                aria-label={t('ariaEditTitle', lang)}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={onTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); onTitleSave(); }
                  if (e.key === 'Escape') onTitleCancel();
                }}
                autoFocus
                maxLength={200}
              />
            ) : (
              <h2
                className="flex-1 truncate detail-title"
                onClick={() => { setTitleDraft(log.title); setEditingTitle(true); }}
                title={log.title}
              >
                {log.title}
              </h2>
            )}
            {showSaved && (
              <span className="detail-saved-indicator">
                <Check size={14} />
                {t('detailSaved', lang)}
              </span>
            )}
            <button
              className="card-menu-btn detail-pin-btn"
              onClick={() => {
                if (!log.pinned) {
                  const pinnedCount = loadLogs().filter((l) => l.pinned).length;
                  if (pinnedCount >= 5) { showToast?.(t('pinLimitReached', lang), 'error'); return; }
                }
                updateLog(log.id, { pinned: !log.pinned }); onRefresh();
              }}
              style={log.pinned ? { color: 'var(--accent)' } : undefined}
              title={log.pinned ? t('titleUnpin', lang) : t('titlePin', lang)}
              aria-label={log.pinned ? t('ariaUnpin', lang) : t('ariaPin', lang)}
            >
              <Pin size={18} className="pin-rotate" fill={log.pinned ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
        {/* AI Context copy — primary action */}
        {isHandoff && log.projectId && (
          <button
            className="btn btn-primary flex-row shrink-0 detail-ai-copy-btn"
            onClick={onCopyWithContext}
            title={t('copyAiContextTitle', lang)}
          >
            <Copy size={13} />
            {t('copyAiContext', lang)}
          </button>
        )}
        <div className="shrink-0 relative">
          <button
            className="card-menu-btn"
            data-menu-trigger="detail"
            onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
            title={t('titleActions', lang)}
            aria-label={t('ariaMenu', lang)}
          >
            <MoreVertical size={18} />
          </button>
          {menuContent}
        </div>
      </div>
    </div>
  );
}
