import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/* Render children at document.body, escaping the `.nido` subtree.
   The interim glass modals (edit expense, goal, recurring, category) are dark
   surfaces; rendered inside `.nido` they pick up the warm `.nido .btn` rules
   (specificity 0-2-0) which override the glass `.btn-outline` (0-1-0), turning
   outline buttons into solid paper buttons. Portaling to body removes them
   from the `.nido` cascade so they render with their intended glass styling.
   React context + event bubbling follow the React tree, so handlers and
   stopPropagation keep working across the portal. */
export const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
};
