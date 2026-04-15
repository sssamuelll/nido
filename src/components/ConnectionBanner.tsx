import React, { useState, useEffect } from 'react';
import { Api } from '../api';

export const ConnectionBanner: React.FC = () => {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [serverDown, setServerDown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const goOffline = () => { setOffline(true); setDismissed(false); };
    const goOnline = () => { setOffline(false); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    return Api.onConnectionChange((online) => {
      setServerDown(!online);
      if (!online) setDismissed(false);
    });
  }, []);

  const visible = (offline || serverDown) && !dismissed;
  if (!visible) return null;

  const message = offline
    ? 'Sin conexión a internet'
    : 'Servidor no disponible';

  const handleRetry = async () => {
    try {
      await Api.health();
      setServerDown(false);
    } catch {
      // still down — banner stays
    }
  };

  return (
    <div className="conn-banner" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>{message}</span>
      {serverDown && !offline && (
        <button className="conn-banner__retry" onClick={handleRetry}>Reintentar</button>
      )}
      <button className="conn-banner__close" onClick={() => setDismissed(true)} aria-label="Cerrar">&times;</button>
    </div>
  );
};
