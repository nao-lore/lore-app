import { useEffect } from 'react';
import { getFeatureEnabled } from '../storage';
import type { View } from './useNavigation';

interface KeyboardShortcutsOptions {
  setPaletteOpen: (fn: (v: boolean) => boolean) => void;
  handleNewLog: () => void;
  goToRaw: (view: View) => void;
  goTo: (view: View) => void;
  setShortcutsOpen: (fn: ((v: boolean) => boolean) | boolean) => void;
  shortcutsOpen: boolean;
  paletteOpen: boolean;
  view: View;
  prevView: View;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

/**
 * Global keyboard shortcut handler extracted from App.tsx.
 * Handles Cmd+K (palette), Cmd+N (new log), Cmd+, (settings),
 * number keys (tab switching), ? (shortcuts modal), Escape (back navigation).
 */
export function useKeyboardShortcuts(opts: KeyboardShortcutsOptions): void {
  const {
    setPaletteOpen, handleNewLog, goToRaw, goTo,
    setShortcutsOpen, shortcutsOpen, paletteOpen,
    view, prevView, activeProjectId, setActiveProjectId,
  } = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!getFeatureEnabled('keyboard_shortcuts', true)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') { e.preventDefault(); setPaletteOpen((v: boolean) => !v); return; }
      if (mod && e.key === 'n') { e.preventDefault(); handleNewLog(); return; }
      if (mod && e.key === ',') { e.preventDefault(); goToRaw('settings'); return; }

      const active = document.activeElement;
      const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

      if (e.key === '?' && !mod && !inInput) { e.preventDefault(); setShortcutsOpen((v: boolean) => !v); return; }

      // Number key navigation (1-5 for tab switching)
      if (!inInput && !mod && e.key >= '1' && e.key <= '5') {
        const views: View[] = ['input', 'dashboard', 'history', 'projects', 'todos'];
        const idx = parseInt(e.key) - 1;
        if (idx < views.length) {
          e.preventDefault();
          goTo(views[idx]);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (paletteOpen) { setPaletteOpen(() => false); return; }
        if (inInput) return;
        if (document.querySelector('.modal-overlay, .action-sheet-overlay, .context-menu, .confirm-dialog')) return;
        if (view !== 'input') {
          e.preventDefault();
          if (view === 'detail') {
            goToRaw(prevView === 'detail' ? (activeProjectId ? 'projecthome' : 'history') : prevView);
          } else if (view === 'projecthome') {
            setActiveProjectId(null);
            goToRaw('input');
          } else {
            goToRaw(prevView === view ? 'input' : prevView);
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setPaletteOpen, handleNewLog, goToRaw, goTo, setShortcutsOpen, shortcutsOpen, paletteOpen, view, prevView, activeProjectId, setActiveProjectId]);
}
