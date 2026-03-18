import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownMenuProps {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}

export default memo(function DropdownMenu({ label, value, options, onChange }: DropdownMenuProps) {
  const [open, setOpenRaw] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => { setOpenRaw(false); setFocusIdx(-1); }, []);

  const focusItem = useCallback((idx: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    if (items && items[idx]) {
      items[idx].focus();
      setFocusIdx(idx);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) closeMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeMenu(); return; }
      const len = options.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusItem(focusIdx < len - 1 ? focusIdx + 1 : 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusItem(focusIdx > 0 ? focusIdx - 1 : len - 1);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    // Focus first item on open
    requestAnimationFrame(() => focusItem(options.findIndex((o) => o.key === value)));
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, focusIdx, options, value, focusItem, closeMenu]);

  const currentLabel = options.find((o) => o.key === value)?.label ?? value;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn"
        style={{ fontSize: 12, padding: '4px 10px', minHeight: 26, display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => setOpenRaw(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span style={{ color: 'var(--text-muted)', marginRight: 2 }}>{label}:</span>
        {currentLabel}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div ref={menuRef} className="context-menu" role="menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 140, zIndex: 1000}}>
          {options.map((opt) => (
            <button
              key={opt.key}
              role="menuitem"
              className={`context-menu-item${opt.key === value ? ' active' : ''}`}
              style={opt.key === value ? { fontWeight: 600, color: 'var(--accent-text)' } : undefined}
              onClick={() => { onChange(opt.key); closeMenu(); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
