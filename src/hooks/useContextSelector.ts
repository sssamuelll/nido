import { useState } from 'react';

export type AppContext = 'shared' | 'personal';

export const useContextSelector = (initial: AppContext = 'shared') => {
  const [activeContext, setActiveContext] = useState<AppContext>(initial);
  return { activeContext, setActiveContext };
};
