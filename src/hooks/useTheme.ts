import { useCallback, useEffect, useState } from 'react';

/**
 * Theme preference for the warm "hogar cálido" UI.
 *  - 'light'  → force the paper theme
 *  - 'dark'   → force the espresso dark theme (see [data-theme] in nido.css)
 *  - 'system' → follow the OS (prefers-color-scheme)
 *
 * The resolved theme is written as `data-theme="light|dark"` on <html> so every
 * `.nido` root (shell, portals, toast) re-tokenises at once. Persisted in
 * localStorage under THEME_KEY.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'nido-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const readStored = (): ThemePref => {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
};

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;

const resolve = (pref: ThemePref): ResolvedTheme =>
  pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;

/** Apply the resolved theme to <html> so the scoped tokens switch globally. */
const apply = (resolved: ResolvedTheme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
};

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readStored);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()));

  // Re-resolve + apply whenever the preference changes.
  useEffect(() => {
    const next = resolve(pref);
    setResolved(next);
    apply(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, pref);
  }, [pref]);

  // While on 'system', follow live OS changes.
  useEffect(() => {
    if (pref !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? 'dark' : 'light';
      setResolved(next);
      apply(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  /** Header button: flip between light and dark (collapsing 'system'). */
  const toggle = useCallback(() => {
    setPref((prev) => (resolve(prev) === 'dark' ? 'light' : 'dark'));
  }, []);

  return { pref, resolved, setPref, toggle };
}

/** One-shot applier for app boot, before React mounts — avoids a light flash. */
export function initThemeOnce(): void {
  apply(resolve(readStored()));
}
