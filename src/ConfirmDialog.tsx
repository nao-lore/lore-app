import { useEffect, useRef, memo } from 'react';
import { useFocusTrap } from './useFocusTrap';

interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default memo(function ConfirmDialog({ title, description, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true }: ConfirmDialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    return () => {
      const el = previouslyFocusedRef.current;
      if (el && el instanceof HTMLElement) {
        setTimeout(() => el.focus(), 0);
      }
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div ref={trapRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby={description ? 'confirm-dialog-desc' : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-title" id="confirm-dialog-title">{title}</div>
        {description && <div className="confirm-dialog-desc" id="confirm-dialog-desc">{description}</div>}
        <div className="confirm-dialog-actions">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
});
