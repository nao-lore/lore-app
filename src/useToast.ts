import { useState, useCallback, useEffect, useRef } from 'react';

type ToastType = 'default' | 'success' | 'error';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
  action?: ToastAction;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'default', visible: false });
  const timerRef = useRef<number>(0);

  const show = useCallback((message: string, type: ToastType = 'default', action?: ToastAction) => {
    clearTimeout(timerRef.current);
    setToast({ message, type, visible: true, action });
    const duration = action ? 6000 : message.includes('\n') ? 3500 : 2000;
    timerRef.current = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, duration);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { toast, showToast: show };
}
