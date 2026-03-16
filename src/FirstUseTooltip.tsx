import { useState, useEffect } from 'react';

interface FirstUseTooltipProps {
  id: string; // unique key for localStorage
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

export default function FirstUseTooltip({ id, text, position = 'bottom', children }: FirstUseTooltipProps) {
  const key = `lore_tip_${id}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [key]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(key, '1');
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {children}
      {show && (
        <div
          onClick={dismiss}
          style={{
            position: 'absolute',
            [position === 'top' ? 'bottom' : position === 'bottom' ? 'top' : position === 'left' ? 'right' : 'left']: 'calc(100% + 8px)',
            left: position === 'top' || position === 'bottom' ? '50%' : undefined,
            transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : undefined,
            background: 'var(--accent)',
            color: 'var(--button-text, #fff)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
