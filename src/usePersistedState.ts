import { useState, useCallback } from 'react';

/**
 * Like useState, but persists the value to localStorage.
 * Reads from localStorage on first render; falls back to defaultValue.
 */
export function usePersistedState<T extends string>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (stored as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
  }, [key]);

  return [value, set];
}
