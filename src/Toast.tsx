import type { ToastState } from './useToast';

export function Toast({ message, type, visible, action }: ToastState) {
  if (!message) return null;
  const cls = ['toast', visible ? 'toast-visible' : '', type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : '']
    .filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ whiteSpace: 'pre-line' }} aria-live="polite" role="status">
      <span style={{ marginRight: 6, fontSize: 14 }}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      <span>{message}</span>
      {action && (
        <button
          className="toast-action"
          onClick={(e) => { e.stopPropagation(); action.onClick(); }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
