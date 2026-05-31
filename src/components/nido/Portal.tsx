import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/* Render children at document.body, inside a `.nido` token scope.
   Modals are portaled out of the page tree (so a fixed overlay isn't clipped
   by an ancestor), but wrapped in `.nido nido-portal` so the warm paper tokens
   + the `.nido .modal/.form-input/...` paper layer in nido.css apply. The
   `nido-portal` modifier strips the full-page paper background/min-height so
   the wrapper collapses to nothing and only the fixed overlay paints.
   React context + event bubbling follow the React tree, so handlers and
   stopPropagation keep working across the portal. */
export const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  if (!mounted) return null;
  return createPortal(<div className="nido nido-portal">{children}</div>, document.body);
};
