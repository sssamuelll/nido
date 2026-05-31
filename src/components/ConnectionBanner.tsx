import React, { useState, useEffect } from 'react';
import { Api } from '../api';

export const ConnectionBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = Api.onConnectionChange((online) => {
      setIsOffline(!online);
    });
    return unsubscribe;
  }, []);

  // Rendered at the App root, outside any screen `.nido` scope. Uses
  // `.nido nido-portal` so it carries warm tokens WITHOUT the 100vh min-height
  // of a normal `.nido` block (which would inject a phantom full-viewport band
  // above the app). The banner itself is position:fixed.
  return (
    <div className="nido nido-portal">
      <div
        role="status"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '8px 16px', fontSize: 13, fontWeight: 600,
          background: 'var(--berry)', color: '#fff',
          transform: isOffline ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform .25s ease', pointerEvents: isOffline ? 'auto' : 'none',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 9, background: '#fff', opacity: 0.9 }} />
        Sin conexión — reintentando…
      </div>
    </div>
  );
};
