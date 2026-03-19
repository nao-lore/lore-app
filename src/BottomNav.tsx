import { memo } from 'react';
import { LayoutDashboard, PenSquare, FolderKanban, Settings } from 'lucide-react';
import { t } from './i18n';
import type { Lang } from './i18n';
import type { View } from './App';

interface BottomNavProps {
  activeView: string;
  onNavigate: (view: View) => void;
  lang: Lang;
}

const TABS = [
  { view: 'dashboard' as const, icon: LayoutDashboard, labelKey: 'navDashboard' as const },
  { view: 'input' as const, icon: PenSquare, labelKey: 'navInput' as const },
  { view: 'projects' as const, icon: FolderKanban, labelKey: 'navProjects' as const },
  { view: 'settings' as const, icon: Settings, labelKey: 'settings' as const },
];

function BottomNav({ activeView, onNavigate, lang }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label={t('ariaBottomNav', lang)}>
      <div className="bottom-nav-inner">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.view ||
            (tab.view === 'input' && (activeView === 'input' || activeView === 'detail')) ||
            (tab.view === 'settings' && (activeView === 'settings' || activeView === 'help' || activeView === 'pricing'));
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
      </div>
    </nav>
  );
}

export default memo(BottomNav);
