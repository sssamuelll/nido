import React from 'react';

export const LoadingScreen: React.FC<{ text?: string }> = ({ text = 'Cargando…' }) => {
  return (
    <div className="nido grain" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div
          className="brand-mark"
          style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(150deg, var(--pine), var(--clay))', color: '#fff', fontFamily: 'var(--serif)', fontSize: 30, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}
        >
          n
        </div>
        <div
          style={{ width: 28, height: 28, margin: '0 auto', borderRadius: '50%', border: '3px solid var(--line)', borderTopColor: 'var(--clay)', animation: 'nido-spin .8s linear infinite' }}
        />
        {text ? <p style={{ marginTop: 16, color: 'var(--ink-2)', fontSize: 14 }}>{text}</p> : null}
      </div>
    </div>
  );
};
