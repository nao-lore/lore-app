import { useState, useEffect, useCallback } from 'react';
import type { Project } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';
import { updateProject } from './storage';
import { useFocusTrap } from './useFocusTrap';

import { PROJECT_COLORS, getProjectColor } from './projectColors';

const EMOJI_PRESETS = [
  '📁', '📂', '💼', '🚀', '⚡', '🔥', '💡', '🎯', '🏗️', '🛠️',
  '📊', '📈', '🧪', '🔬', '🎨', '✏️', '📝', '🗂️', '🌐', '🤖',
  '💻', '📱', '🎮', '🎵', '📸', '🏠', '🌟', '❤️', '🔒', '📦',
  '🐛', '🧹', '📚', '🎓', '💰', '🛒', '✈️', '🏋️', '🍕', '☕',
];

interface ProjectAppearanceModalProps {
  project: Project;
  lang: Lang;
  onClose: () => void;
  onUpdated: () => void;
}

export default function ProjectAppearanceModal({ project, lang, onClose, onUpdated }: ProjectAppearanceModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [selectedColor, setSelectedColor] = useState<string>(project.color || '');
  const [selectedIcon, setSelectedIcon] = useState<string>(project.icon || '');

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSave = () => {
    updateProject(project.id, {
      color: selectedColor || undefined,
      icon: selectedIcon || undefined,
    });
    onUpdated();
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={trapRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-label={t('projectEditAppearance', lang)} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>
          {t('projectEditAppearance', lang)}
        </h3>

        {/* Color picker */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {t('projectColorLabel', lang)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* None option */}
            <button
              onClick={() => setSelectedColor('')}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: !selectedColor ? '2px solid var(--text-primary)' : '2px solid var(--border-default)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'var(--text-muted)',
              }}
              title={t('projectNoColor', lang)}
            >
              ×
            </button>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedColor(c.key)}
                title={c.label}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: c.hex,
                  border: selectedColor === c.key ? '2px solid var(--text-primary)' : '2px solid transparent',
                  outline: selectedColor === c.key ? '2px solid var(--bg-card)' : 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              />
            ))}
          </div>
        </div>

        {/* Icon picker */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('projectIconLabel', lang)}
            </span>
            {selectedIcon && (
              <button
                className="btn-link"
                style={{ fontSize: 11 }}
                onClick={() => setSelectedIcon('')}
              >
                {t('projectRemoveIcon', lang)}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {EMOJI_PRESETS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setSelectedIcon(emoji)}
                style={{
                  width: 36, height: 36, borderRadius: 8, fontSize: 20,
                  border: selectedIcon === emoji ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                  background: selectedIcon === emoji ? 'var(--accent-bg, rgba(99,102,241,0.08))' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (selectedIcon !== emoji) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                onMouseLeave={(e) => { if (selectedIcon !== emoji) e.currentTarget.style.background = 'transparent'; }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-sidebar)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{t('previewLabel', lang)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedColor && (
              <div style={{
                width: 4, height: 24, borderRadius: 2,
                background: getProjectColor(selectedColor),
                flexShrink: 0,
              }} />
            )}
            {selectedIcon && (
              <span style={{ fontSize: 18, flexShrink: 0 }}>{selectedIcon}</span>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>
              {project.name}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ fontSize: 13 }}>
            {t('cancel', lang)}
          </button>
          <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: 13 }}>
            {t('mnAccept', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
