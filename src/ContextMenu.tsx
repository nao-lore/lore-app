import { useEffect, useRef, useCallback } from 'react';

export interface MenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  items: MenuItem[];
  anchorRect: DOMRect;
  onClose: () => void;
}

export default function ContextMenu({ items, anchorRect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      const trigger = (e.target as HTMLElement).closest('.sidebar-icon-btn, .action-menu-btn, .card-menu-btn, [data-menu-trigger]');
      if (trigger) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, handleKeyDown]);

  // Position: below the anchor, aligned to right edge
  // If it would go off-screen bottom, show above instead
  const menuHeight = items.length * 34 + 8; // estimate
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const top = spaceBelow >= menuHeight + 8
    ? anchorRect.bottom + 4
    : anchorRect.top - menuHeight - 4;

  // Align right edge with anchor right, but don't go off left edge
  const right = window.innerWidth - anchorRect.right;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{
        position: 'fixed',
        top,
        right: Math.max(4, right),
        zIndex: 1000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          className={`context-menu-item${item.danger ? ' danger' : ''}`}
          onClick={() => { item.onClick(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
