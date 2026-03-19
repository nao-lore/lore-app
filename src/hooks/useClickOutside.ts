import { useEffect, useRef } from 'react';

/**
 * Hook to handle click-outside-to-close and Escape-to-close patterns.
 * Consolidates the repeated addEventListener pattern used across dropdown/popup components.
 *
 * @param active - Whether the listener is active (e.g., menu is open)
 * @param onClose - Callback when click outside or Escape is detected
 * @returns A ref to attach to the container element
 */
export function useClickOutside<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active, onClose]);

  return ref;
}
