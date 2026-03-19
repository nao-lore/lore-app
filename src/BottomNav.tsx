import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { LayoutDashboard, PenSquare, FolderKanban, MoreHorizontal, FileText, CheckSquare, Clock, Settings } from 'lucide-react';
import { t } from './i18n';
import type { Lang } from './i18n';
import type { View } from './App';

interface BottomNavProps {
  activeView: string;
  onNavigate: (view: View) => void;
  lang: Lang;
}

const MAIN_TABS = [
  { view: 'dashboard' as const, icon: LayoutDashboard, labelKey: 'navDashboard' as const },
  { view: 'input' as const, icon: PenSquare, labelKey: 'navInput' as const },
  { view: 'projects' as const, icon: FolderKanban, labelKey: 'navProjects' as const },
];

const MORE_ITEMS = [
  { view: 'history' as const, icon: FileText, labelKey: 'navLogs' as const },
  { view: 'todos' as const, icon: CheckSquare, labelKey: 'navTodo' as const },
  { view: 'timeline' as const, icon: Clock, labelKey: 'navTimeline' as const },
  { view: 'settings' as const, icon: Settings, labelKey: 'settings' as const },
];

function BottomNav({ activeView, onNavigate, lang }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isMoreActive = MORE_ITEMS.some((item) =>
    activeView === item.view ||
    (item.view === 'settings' && (activeView === 'settings' || activeView === 'help' || activeView === 'pricing'))
  );

  // Close the more menu when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  const handleMoreItemClick = useCallback((view: View) => {
    onNavigate(view);
    setMoreOpen(false);
  }, [onNavigate]);

  return (
    <nav className="bottom-nav" aria-label={t('ariaBottomNav', lang)}>
      <div className="bottom-nav-inner">
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.view ||
            (tab.view === 'input' && (activeView === 'input' || activeView === 'detail'));
          return (
            <button
              key={tab.view}
              className={`bottom-nav-item${active ? ' active' : ''}`}
              onClick={() => onNavigate(tab.view)}
              aria-label={t(tab.labelKey, lang)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{t(tab.labelKey, lang)}</span>
            </button>
          );
        })}

        {/* More menu */}
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button
            className={`bottom-nav-item${isMoreActive ? ' active' : ''}`}
            onClick={() => setMoreOpen(!moreOpen)}
            aria-label={t('navMore', lang)}
            aria-expanded={moreOpen}
            aria-haspopup="true"
          >
            <MoreHorizontal size={20} />
            <span>{t('navMore', lang)}</span>
          </button>

          {moreOpen && (
            <div
              className="bottom-nav-more-menu"
              role="menu"
              style={{
                position: 'absolute',
                bottom: '100%',
                right: 0,
                marginBottom: 8,
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
                minWidth: 180,
                padding: '6px 0',
                zIndex: 100,
              }}
            >
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.view ||
                  (item.view === 'settings' && (activeView === 'settings' || activeView === 'help' || activeView === 'pricing'));
                return (
                  <button
                    key={item.view}
                    role="menuitem"
                    className={`bottom-nav-more-item${active ? ' active' : ''}`}
                    onClick={() => handleMoreItemClick(item.view)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '10px 16px',
                      background: active ? 'var(--accent-bg, rgba(99,102,241,0.08))' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      fontSize: 13, fontFamily: 'inherit',
                      color: active ? 'var(--accent)' : 'var(--text-body)',
                      transition: 'background 0.1s',
                    }}
                  >
                    <Icon size={16} />
                    <span>{t(item.labelKey, lang)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default memo(BottomNav);
