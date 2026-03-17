import { useState, useCallback } from 'react';
import { safeGetItem, safeSetItem } from './storage';

/**
 * Like useState, but persists the value to localStorage.
 * Reads from localStorage on first render; falls back to defaultValue.
 */
export function usePersistedState<T extends string>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = safeGetItem(key);
    return stored !== null ? (stored as T) : defaultValue;
  });

  const set = useCallback((v: T) => {
    setValue(v);
    safeSetItem(key, v);
  }, [key]);

  return [value, set];
}
