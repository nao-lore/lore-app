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

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  visible: boolean;
  action?: ToastAction;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timersRef = useRef<number[]>([]);

  const show = useCallback((message: string, type: ToastType = 'default', action?: ToastAction) => {
    const id = nextId.current++;
    const item: ToastItem = { id, message, type, visible: true, action };

    setToasts(prev => {
      const next = [...prev, item];
      if (next.length > 3) next.shift();
      return next;
    });

    const duration = action ? 6000 : message.includes('\n') ? 3500 : 2000;
    const t1 = window.setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
      const t2 = window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 400);
      timersRef.current.push(t2);
    }, duration);
    timersRef.current.push(t1);
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(t => clearTimeout(t));
  }, []);

  // Backward compat: expose first toast as `toast`
  const toast: ToastState = toasts[0] || { message: '', type: 'default' as ToastType, visible: false };

  return { toast, toasts, showToast: show };
}
