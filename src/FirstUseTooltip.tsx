import { useState, useEffect } from 'react';
import { safeGetItem, safeSetItem } from './storage';
import { t } from './i18n';
import type { Lang } from './i18n';

interface FirstUseTooltipProps {
  id: string; // unique key for localStorage
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  lang?: Lang;
}

export default function FirstUseTooltip({ id, text, position = 'bottom', children, lang }: FirstUseTooltipProps) {
  const key = `lore_tip_${id}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!safeGetItem(key)) {
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [key]);

  const dismiss = () => {
    setShow(false);
    safeSetItem(key, '1');
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {children}
      {show && (
        <div
          className="first-use-tooltip"
          onClick={dismiss}
          style={{
            position: 'absolute',
            [position === 'top' ? 'bottom' : position === 'bottom' ? 'top' : position === 'left' ? 'right' : 'left']: 'calc(100% + 8px)',
            left: position === 'top' || position === 'bottom' ? '50%' : undefined,
            transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : undefined,
          }}
        >
          <span>{text}</span>
          <span className="first-use-tooltip-close" aria-label={lang ? t('close', lang) : 'Close'}>&times;</span>
        </div>
      )}
    </div>
  );
}
