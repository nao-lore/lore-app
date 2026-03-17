import { useState, useEffect, useCallback, memo } from 'react';
import { LayoutDashboard, BarChart2, CheckSquare, ScrollText, MoreHorizontal, FolderOpen, Clock, FileBarChart, BookOpen, Settings } from 'lucide-react';
import { t } from './i18n';
import type { Lang } from './i18n';

interface BottomNavProps {
  activeView: string;
  onNavigate: (view: string) => void;
  lang: Lang;
}

const PRIMARY_TABS = [
  { view: 'input', icon: LayoutDashboard, labelKey: 'navHome' as const },
  { view: 'dashboard', icon: BarChart2, labelKey: 'navDashboard' as const },
  { view: 'history', icon: ScrollText, labelKey: 'navLogs' as const },
  { view: 'projects', icon: FolderOpen, labelKey: 'navProjects' as const },
];

const MORE_ITEMS = [
  { view: 'todos', icon: CheckSquare, labelKey: 'navTodo' as const },
  { view: 'timeline', icon: Clock, labelKey: 'navTimeline' as const },
  { view: 'weeklyreport', icon: FileBarChart, labelKey: 'navWeeklyReport' as const },
  { view: 'summarylist', icon: BookOpen, labelKey: 'navProjectSummary' as const },
  { view: 'settings', icon: Settings, labelKey: 'settings' as const },
];

function BottomNav({ activeView, onNavigate, lang }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Close on Escape
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMore(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [moreOpen, closeMore]);

  const isMoreActive = MORE_ITEMS.some((item) => item.view === activeView);

  return (
    <>
      {/* More sheet overlay */}
      {moreOpen && (
        <div className="bottom-nav-overlay" onClick={closeMore}>
          <div className="bottom-nav-sheet" onClick={(e) => e.stopPropagation()}>
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.view;
              return (
                <button
                  key={item.view}
                  className={`bottom-nav-sheet-item${active ? ' active' : ''}`}
                  onClick={() => {
                    setMoreOpen(false);
                    onNavigate(item.view);
                  }}
                >
                  <Icon size={18} />
                  <span>{t(item.labelKey, lang)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeView === tab.view ||
              (tab.view === 'input' && (activeView === 'input' || activeView === 'detail'));
            return (
              <button
                key={tab.view}
                className={`bottom-nav-item${active ? ' active' : ''}`}
                onClick={() => onNavigate(tab.view)}
              >
                <Icon size={20} />
                <span>{t(tab.labelKey, lang)}</span>
              </button>
            );
          })}
          <button
            className={`bottom-nav-item${isMoreActive ? ' active' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreHorizontal size={20} />
            <span>{t('more', lang)}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default memo(BottomNav);
