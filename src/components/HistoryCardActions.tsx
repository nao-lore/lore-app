import { memo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LogEntry, Project } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { LogContextMenu } from './HistoryCard';

interface HistoryCardActionsProps {
  log: LogEntry;
  lang: Lang;
  projects: Project[];
  actionSheetLog: LogEntry | null;
  onSetActionSheetLog: (log: LogEntry | null) => void;
  onLogAction: (log: LogEntry, action: string, value?: string) => void;
}

/** Action button + context menu for a history card/list item */
const HistoryCardActions = memo(function HistoryCardActions({
  log, lang, projects, actionSheetLog, onSetActionSheetLog, onLogAction,
}: HistoryCardActionsProps) {
  return (
    <div className="card-action-pos" onClick={(e) => e.stopPropagation()}>
      <button
        className="action-menu-btn"
        aria-label={t('ariaMenu', lang)}
        onClick={() => onSetActionSheetLog(actionSheetLog?.id === log.id ? null : log)}
      >
        <MoreHorizontal size={16} />
      </button>
      {actionSheetLog?.id === log.id && (
        <LogContextMenu
          log={log}
          lang={lang}
          projects={projects}
          onClose={() => onSetActionSheetLog(null)}
          onAction={(action, value) => onLogAction(log, action, value)}
        />
      )}
    </div>
  );
});

export default HistoryCardActions;
