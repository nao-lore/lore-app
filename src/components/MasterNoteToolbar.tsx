import { memo } from 'react';
import { Pencil, Copy } from 'lucide-react';
import type { MasterNote, LogEntry } from '../types';
import type { Lang } from '../i18n';
import { t, tf } from '../i18n';
import { normalizeItems, renderSimpleMarkdown } from './masterNoteHelpers';
import { ReadOnlyText, ReadOnlyList, EditableText, EditableList, RelatedLogs } from './MasterNoteEditor';

// ---- Action bar ----

interface MasterNoteActionBarProps {
  lang: Lang;
  hasDraft: boolean;
  editing: boolean;
  saved: MasterNote | undefined;
  isProcessing: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export const MasterNoteActionBar = memo(function MasterNoteActionBar({
  lang, hasDraft, editing, saved, isProcessing, onSave, onCancel,
}: MasterNoteActionBarProps) {
  return (
    <div className="mn-action-bar">
      {hasDraft && !editing && (
        <div className="mn-action-bar-label">
          {t('mnPreviewTitle', lang)}
        </div>
      )}
      {editing && (
        <div className="mn-action-bar-label">
          <Pencil size={14} style={{ color: 'var(--accent)' }} />
          <span>{t('mnEditMode', lang)}</span>
        </div>
      )}
      {!hasDraft && !editing && saved && (
        <div className="mn-action-bar-label">
          <span className="meta" style={{ fontSize: 12 }}>
            {tf('mnUpdatedAt', lang, new Date(saved.updatedAt).toLocaleString())}
            {' · '}
            {tf('mnLogCount', lang, saved.relatedLogIds.length)}
          </span>
        </div>
      )}
      <div className="mn-action-bar-buttons">
        {(hasDraft || editing) && (
          <button className="btn btn-primary" onClick={onSave} disabled={isProcessing}>
            {t('mnAccept', lang)}
          </button>
        )}
        {(hasDraft || editing) && (
          <button className="btn" onClick={onCancel} disabled={isProcessing}>
            {t('mnEditCancel', lang)}
          </button>
        )}
      </div>
    </div>
  );
});

// ---- Refine panel ----

interface MasterNoteRefinePanelProps {
  lang: Lang;
  refineText: string;
  onRefineTextChange: (v: string) => void;
  onClose: () => void;
  onRefine: () => void;
  refining: boolean;
}

export const MasterNoteRefinePanel = memo(function MasterNoteRefinePanel({
  lang, refineText, onRefineTextChange, onClose, onRefine, refining,
}: MasterNoteRefinePanelProps) {
  return (
    <div className="mn-refine-panel">
      <textarea
        className="mn-refine-textarea"
        value={refineText}
        onChange={(e) => onRefineTextChange(e.target.value)}
        placeholder={t('mnRefineInstruction', lang)}
        aria-label={t('mnRefineInstruction', lang)}
        rows={2}
        autoFocus
        maxLength={10000}
      />
      <div className="flex justify-end gap-3">
        <button className="btn" onClick={onClose}>
          {t('mnRefineCancel', lang)}
        </button>
        <button className="btn btn-primary" onClick={onRefine} disabled={!refineText.trim() || refining}>
          {refining ? t('mnRefining', lang) : t('mnRefineSend', lang)}
        </button>
      </div>
    </div>
  );
});

// ---- Read-only content section ----

interface MasterNoteReadOnlyProps {
  current: MasterNote;
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
  lang: Lang;
  aiContext: string;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export const MasterNoteReadOnly = memo(function MasterNoteReadOnly({
  current, logs, onOpenLog, lang, aiContext, showToast,
}: MasterNoteReadOnlyProps) {
  return (
    <div className="flex-col-gap-md">
      <ReadOnlyText label={t('mnOverview', lang)} value={current.overview} />
      <ReadOnlyList label={t('mnDecisions', lang)} items={normalizeItems(current.decisions)} logs={logs} onOpenLog={onOpenLog} />
      <ReadOnlyList label={t('mnOpenIssues', lang)} items={normalizeItems(current.openIssues)} logs={logs} onOpenLog={onOpenLog} />
      <ReadOnlyList label={t('mnNextActions', lang)} items={normalizeItems(current.nextActions)} logs={logs} onOpenLog={onOpenLog} />
      <RelatedLogs logIds={current.relatedLogIds} logs={logs} onOpenLog={onOpenLog} lang={lang} />

      {/* AI Context section */}
      <div className="content-card">
        <div className="content-card-header flex items-center justify-between">
          <span>{t('aiContextTitle', lang)}</span>
          <button
            className="btn btn-sm-compact"
            style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(aiContext);
                showToast?.(t('copiedToClipboard', lang), 'success');
              } catch {
                showToast?.(t('copyFailed', lang), 'error');
              }
            }}
            disabled={!aiContext}
          >
            <Copy size={11} />
            {t('mnCopy', lang)}
          </button>
        </div>
        {aiContext ? (
          <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, maxHeight: 400, overflow: 'auto' }}>
            {renderSimpleMarkdown(aiContext)}
          </div>
        ) : (
          <p className="meta text-sm" style={{ margin: 0 }}>{t('aiContextEmpty', lang)}</p>
        )}
      </div>

      <p className="meta text-sm text-right">
        {tf('mnUpdatedAt', lang, new Date(current.updatedAt).toLocaleString())}
        {' · '}
        {tf('mnLogCount', lang, current.relatedLogIds.length)}
      </p>
    </div>
  );
});

// ---- Edit mode content section ----

interface MasterNoteEditContentProps {
  current: MasterNote;
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
  lang: Lang;
  onUpdateDraft: (updates: Partial<MasterNote>) => void;
}

export const MasterNoteEditContent = memo(function MasterNoteEditContent({
  current, logs, onOpenLog, lang, onUpdateDraft,
}: MasterNoteEditContentProps) {
  return (
    <div className="flex-col-gap-md">
      <EditableText
        label={t('mnOverview', lang)}
        value={current.overview}
        onChange={(v) => onUpdateDraft({ overview: v })}
      />
      <EditableList
        label={t('mnDecisions', lang)}
        items={normalizeItems(current.decisions)}
        onChange={(items) => onUpdateDraft({ decisions: items })}
        logs={logs}
        onOpenLog={onOpenLog}
        lang={lang}
      />
      <EditableList
        label={t('mnOpenIssues', lang)}
        items={normalizeItems(current.openIssues)}
        onChange={(items) => onUpdateDraft({ openIssues: items })}
        logs={logs}
        onOpenLog={onOpenLog}
        lang={lang}
      />
      <EditableList
        label={t('mnNextActions', lang)}
        items={normalizeItems(current.nextActions)}
        onChange={(items) => onUpdateDraft({ nextActions: items })}
        logs={logs}
        onOpenLog={onOpenLog}
        lang={lang}
      />
      <RelatedLogs logIds={current.relatedLogIds} logs={logs} onOpenLog={onOpenLog} lang={lang} />
    </div>
  );
});
