import { useEffect } from 'react';
import type { ThemePref } from '../storage';
import type { Lang } from '../i18n';

function resolveEffectiveTheme(pref: ThemePref): 'light' | 'dark' | 'high-contrast' {
  if (pref === 'light' || pref === 'dark' || pref === 'high-contrast') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Sync theme preference to data-theme attribute and html lang/dir to current UI language.
 * Extracted from App.tsx to reduce the god-component's effect count.
 */
export function useThemeSync(themePref: ThemePref, lang: Lang): void {
  // Apply data-theme attribute
  useEffect(() => {
    const apply = () => {
      const effective = resolveEffectiveTheme(themePref);
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply();

    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      const timer = setInterval(apply, 60 * 60 * 1000);
      return () => { mq.removeEventListener('change', apply); clearInterval(timer); };
    }
  }, [themePref]);

  // Sync html lang attribute and dir with current UI language
  useEffect(() => {
    document.documentElement.lang = lang;
    const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    document.documentElement.dir = rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
  }, [lang]);
}
