import { useEffect } from 'react';
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

export default function ConfirmDialog({ title, description, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true }: ConfirmDialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div ref={trapRef} className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-title">{title}</div>
        {description && <div className="confirm-dialog-desc">{description}</div>}
        <div className="confirm-dialog-actions">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
