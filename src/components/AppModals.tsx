import React, { memo } from 'react';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import ConfirmDialog from '../ConfirmDialog';

// ---- Keyboard shortcuts modal ----

interface ShortcutsModalProps {
  lang: Lang;
  shortcutsTrapRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export const ShortcutsModal = memo(function ShortcutsModal({
  lang, shortcutsTrapRef, onClose,
}: ShortcutsModalProps) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={shortcutsTrapRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-label={t('shortcutsTitle', lang)} onClick={(e) => e.stopPropagation()}>
        <h3 className="fs-16 shortcuts-title">{t('shortcutsTitle', lang)}</h3>
        <div className="flex-col gap-10">
          {([
            { keys: '\u2318 N', desc: t('shortcutNewLog', lang) },
            { keys: '\u2318 K', desc: t('shortcutSearch', lang) },
            { keys: '\u2318 ,', desc: t('shortcutSettings', lang) },
            { keys: '\u2318 Enter', desc: t('shortcutSubmit', lang) },
            { keys: '?', desc: t('shortcutShortcuts', lang) },
            { keys: 'Esc', desc: t('shortcutEscape', lang) },
          ]).map((item) => (
            <div key={item.keys} className="shortcuts-row">
              <span className="text-md" style={{ color: 'var(--text-body)' }}>{item.desc}</span>
              <kbd className="kbd-key">{item.keys}</kbd>
            </div>
          ))}
        </div>
        <div className="mt-lg text-right">
          <button className="btn text-sm" onClick={onClose}>
            {t('close', lang)}
          </button>
        </div>
      </div>
    </div>
  );
});

// ---- Unsaved input confirm dialog ----

interface UnsavedInputDialogProps {
  lang: Lang;
  onConfirm: () => void;
  onCancel: () => void;
}

export const UnsavedInputDialog = memo(function UnsavedInputDialog({
  lang, onConfirm, onCancel,
}: UnsavedInputDialogProps) {
  return (
    <ConfirmDialog
      title={t('unsavedInputTitle', lang)}
      description={t('unsavedInputDesc', lang)}
      confirmLabel={t('unsavedInputConfirm', lang)}
      cancelLabel={t('cancel', lang)}
      danger={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
});
