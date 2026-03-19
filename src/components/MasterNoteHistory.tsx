import { memo } from 'react';
import { Clock } from 'lucide-react';
import type { MasterNote, MasterNoteSnapshot } from '../types';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import ConfirmDialog from '../ConfirmDialog';

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

// ─── Snapshot preview (read-only, no source links) ───
function SnapshotPreview({ note, lang }: { note: MasterNote; lang: Lang }) {
  return (
    <div className="mn-snapshot-list">
      <div>
        <div className="content-card-header">{t('mnOverview', lang)}</div>
        <p className="mn-snapshot-text">{note.overview || '—'}</p>
      </div>
      {note.decisions.length > 0 && (
        <div>
          <div className="content-card-header">{t('mnDecisions', lang)}</div>
          <ul className="mn-snapshot-ul">
            {note.decisions.map((d, i) => <li key={i}>{d.text}</li>)}
          </ul>
        </div>
      )}
      {note.openIssues.length > 0 && (
        <div>
          <div className="content-card-header">{t('mnOpenIssues', lang)}</div>
          <ul className="mn-snapshot-ul">
            {note.openIssues.map((d, i) => <li key={i}>{d.text}</li>)}
          </ul>
        </div>
      )}
      {note.nextActions.length > 0 && (
        <div>
          <div className="content-card-header">{t('mnNextActions', lang)}</div>
          <ul className="mn-snapshot-ul">
            {note.nextActions.map((d, i) => <li key={i}>{d.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── History panel (overlay) ───
interface MasterNoteHistoryPanelProps {
  lang: Lang;
  saved: MasterNote | undefined;
  snapshots: MasterNoteSnapshot[];
  previewSnap: MasterNoteSnapshot | null;
  confirmRestoreVersion: number | null;
  onClose: () => void;
  onPreviewSnap: (snap: MasterNoteSnapshot | null) => void;
  onRestore: (version: number) => void;
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
}

export const MasterNoteHistoryPanel = memo(function MasterNoteHistoryPanel({
  lang, saved, snapshots, previewSnap, confirmRestoreVersion,
  onClose, onPreviewSnap, onRestore, onConfirmRestore, onCancelRestore,
}: MasterNoteHistoryPanelProps) {
  return (
    <>
      <div className="mn-history-overlay" role="presentation" onClick={() => { onClose(); onPreviewSnap(null); }}>
        <div className="mn-history-panel" onClick={(e) => e.stopPropagation()}>
          <div className="mn-history-header">
            <h3>{t('mnHistoryTitle', lang)}</h3>
            <button className="btn btn-ghost mn-history-close-btn" onClick={() => { onClose(); onPreviewSnap(null); }}>×</button>
          </div>

          {snapshots.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Clock size={48} strokeWidth={1.2} color="var(--text-muted)" opacity={0.4} /></div>
              <p>{t('mnHistoryEmpty', lang)}</p>
            </div>
          ) : (
            <div className="mn-history-content">
              {/* Version list */}
              <div className="mn-history-list">
                {/* Current version */}
                {saved && (
                  <div
                    className={`mn-history-item mn-history-item-current${!previewSnap ? ' active' : ''}`}
                    onClick={() => onPreviewSnap(null)}
                  >
                    <div className="mn-history-item-version">
                      v{snapshots.length + 1}
                      <span className="mn-history-badge-current">{t('mnHistoryCurrent', lang)}</span>
                    </div>
                    <div className="mn-history-item-date">
                      {new Date(saved.updatedAt).toLocaleString()}
                    </div>
                    <div className="mn-history-item-preview">
                      {saved.overview ? truncate(saved.overview, 60) : '—'}
                    </div>
                  </div>
                )}
                {/* Past versions */}
                {snapshots.map((snap) => (
                  <div
                    key={snap.version}
                    className={`mn-history-item${previewSnap?.version === snap.version ? ' active' : ''}`}
                    onClick={() => onPreviewSnap(snap)}
                  >
                    <div className="mn-history-item-version">v{snap.version}</div>
                    <div className="mn-history-item-date">
                      {new Date(snap.savedAt).toLocaleString()}
                    </div>
                    <div className="mn-history-item-preview">
                      {snap.note.overview ? truncate(snap.note.overview, 60) : '—'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview area */}
              <div className="mn-history-detail">
                {previewSnap ? (
                  <>
                    <div className="mn-history-header-row">
                      <div>
                        <div className="mn-history-version-label">v{previewSnap.version}</div>
                        <div className="meta fs-11">{new Date(previewSnap.savedAt).toLocaleString()}</div>
                      </div>
                      <button className="btn btn-primary fs-12" onClick={() => onRestore(previewSnap.version)}>
                        {t('mnHistoryRestore', lang)}
                      </button>
                    </div>
                    <SnapshotPreview note={previewSnap.note} lang={lang} />
                  </>
                ) : saved ? (
                  <>
                    <div className="mb-lg">
                      <div className="mn-history-version-label">v{snapshots.length + 1} <span className="mn-history-badge-current">{t('mnHistoryCurrent', lang)}</span></div>
                      <div className="meta fs-11">{new Date(saved.updatedAt).toLocaleString()}</div>
                    </div>
                    <SnapshotPreview note={saved} lang={lang} />
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmRestoreVersion !== null && (
        <ConfirmDialog
          title={t('mnHistoryRestore', lang)}
          description={t('mnHistoryRestoreConfirm', lang)}
          confirmLabel={t('mnHistoryRestore', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={onConfirmRestore}
          onCancel={onCancelRestore}
          danger={false}
        />
      )}
    </>
  );
});
