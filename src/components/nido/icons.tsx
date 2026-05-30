/* nido/icons.tsx — line-icon set for the warm "hogar cálido" UI.
   Ported 1:1 from the prototype's nido-ui.jsx (stroke 1.9, line style).
   Replaces lucide-react. SVGs inherit `currentColor`, so colour comes from
   the surrounding .cat-ico tile or text colour. */
import React from 'react';

const S = {
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const Icon = {
  home:   () => <svg viewBox="0 0 24 24" {...S}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>,
  plus:   () => <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9"/><path d="M12 8.5v7M8.5 12h7"/></svg>,
  chart:  () => <svg viewBox="0 0 24 24" {...S}><path d="M4 20V10M9.5 20V4M15 20v-7M20.5 20v-12"/></svg>,
  target: () => <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>,
  clock:  () => <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>,
  gear:   () => <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/></svg>,
  search: () => <svg viewBox="0 0 24 24" {...S}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>,
  bell:   () => <svg viewBox="0 0 24 24" {...S}><path d="M18 8a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></svg>,
  moon:   () => <svg viewBox="0 0 24 24" {...S}><path d="M20 13.5A8 8 0 1 1 10.5 4 6.4 6.4 0 0 0 20 13.5Z"/></svg>,
  back:   () => <svg viewBox="0 0 24 24" {...S}><path d="m14 6-6 6 6 6"/></svg>,
  fwd:    () => <svg viewBox="0 0 24 24" {...S}><path d="m10 6 6 6-6 6"/></svg>,
  edit:   () => <svg viewBox="0 0 24 24" {...S}><path d="M12 20h8"/><path d="M16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1 1-4Z"/></svg>,
  cal:    () => <svg viewBox="0 0 24 24" {...S}><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>,
  tag:    () => <svg viewBox="0 0 24 24" {...S}><path d="M3.5 11V4.5a1 1 0 0 1 1-1H11l9 9-7 7-9-9Z"/><circle cx="8" cy="8" r="1.4"/></svg>,
  repeat: () => <svg viewBox="0 0 24 24" {...S}><path d="M4 8h12l-2.5-2.5M20 16H8l2.5 2.5"/></svg>,
  x:      () => <svg viewBox="0 0 24 24" {...S}><path d="m6 6 12 12M18 6 6 18"/></svg>,
  arrow:  () => <svg viewBox="0 0 24 24" {...S}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  trend:  () => <svg viewBox="0 0 24 24" {...S}><path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/></svg>,
  lock:   () => <svg viewBox="0 0 24 24" {...S}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>,
  phone:  () => <svg viewBox="0 0 24 24" {...S}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>,
  doc:    () => <svg viewBox="0 0 24 24" {...S}><path d="M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21Z"/><path d="M14 2.5V6.5h4"/></svg>,
  exit:   () => <svg viewBox="0 0 24 24" {...S}><path d="M15 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9"/><path d="M11 12h9M16.5 8l3.5 4-3.5 4"/></svg>,
  link:   () => <svg viewBox="0 0 24 24" {...S}><path d="M9 15 15 9M10.5 6.5l1.5-1.5a4 4 0 0 1 6 6l-2 2M13.5 17.5 12 19a4 4 0 0 1-6-6l2-2"/></svg>,
  refresh:() => <svg viewBox="0 0 24 24" {...S}><path d="M20 11a8 8 0 1 0-1 5"/><path d="M20 4v5h-5"/></svg>,
  trash:  () => <svg viewBox="0 0 24 24" {...S}><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13.5h10L18 7"/></svg>,
  check:  () => <svg viewBox="0 0 24 24" {...S}><path d="m5 12.5 4.5 4.5L19 6.5"/></svg>,
  plusS:  () => <svg viewBox="0 0 24 24" {...S}><path d="M12 5v14M5 12h14"/></svg>,
  dots:   () => <svg viewBox="0 0 24 24" {...S}><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>,
  info:   () => <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>,
  spark:  () => <svg viewBox="0 0 24 24" {...S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/></svg>,
  heart:  () => <svg viewBox="0 0 24 24" {...S}><path d="M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.5C19 15.5 12 20 12 20Z"/></svg>,
} satisfies Record<string, React.FC>;

/* category icons (line) */
export const Cat = {
  food:   () => <svg viewBox="0 0 24 24" {...S}><path d="M7 3v7M5 3v7M9 3v5a2 2 0 0 1-2 2v11M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9"/></svg>,
  cart:   () => <svg viewBox="0 0 24 24" {...S}><path d="M3 4h2l2 12h11l2-8H6.5"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>,
  bread:  () => <svg viewBox="0 0 24 24" {...S}><path d="M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M9 11v6M13 11v6"/></svg>,
  plane:  () => <svg viewBox="0 0 24 24" {...S}><path d="M10.5 14 3 16v-2l6-3.5V5a1.5 1.5 0 0 1 3 0v5.5L18 14v2l-6-2-.7 3.5L13 19v1.5L9.5 19 6 20.5V19l2.5-1.2Z"/></svg>,
  house:  () => <svg viewBox="0 0 24 24" {...S}><path d="M4 11 12 4l8 7"/><path d="M6 10v9.5h12V10"/></svg>,
  health: () => <svg viewBox="0 0 24 24" {...S}><path d="M5 9v6M19 9v6M5 12h14M3 10v4M21 10v4M7 8.5v7M17 8.5v7"/></svg>,
  party:  () => <svg viewBox="0 0 24 24" {...S}><path d="M3 21 9 8l7 7Z"/><path d="M14 3v2M19 5l-1.5 1.5M21 11h-2M16 9a3 3 0 0 0-3-3"/></svg>,
  stay:   () => <svg viewBox="0 0 24 24" {...S}><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11"/><path d="M7 8h1M11 8h1M7 12h1M11 12h1M7 16h1M11 16h1M3 21h18"/></svg>,
} satisfies Record<string, React.FC>;

export type IconName = keyof typeof Icon;
export type CatName = keyof typeof Cat;
