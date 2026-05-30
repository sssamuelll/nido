import { useState, useEffect } from 'react';

/**
 * Subscribe to a CSS media query. Used by redesigned screens that have
 * genuinely distinct desktop vs mobile compositions (the prototype ships two
 * separate artboards), so we render one or the other rather than one DOM
 * twisted by CSS. SPA-only (no SSR), so reading matchMedia on first render is safe.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The redesign's desktop/mobile cutover: rail+main above, tab bar below. */
export const MOBILE_QUERY = '(max-width: 767px)';
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
