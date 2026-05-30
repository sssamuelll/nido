import React, { useState } from 'react';
import { useAuth } from '../auth';
import { Icon } from '../components/nido';

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Usuario');

export const PinPage: React.FC = () => {
  const { user, verifyPin, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleVerify = async (value: string) => {
    const success = await verifyPin(value);
    if (!success) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => { setPin(''); setError(false); }, 700);
    }
  };

  const handleDigit = (n: string) => {
    if (pin.length >= 4) return;
    const next = pin + n;
    setPin(next);
    setError(false);
    if (next.length === 4) setTimeout(() => handleVerify(next), 80);
  };
  const handleDelete = () => { setPin((p) => p.slice(0, -1)); setError(false); };

  const keyStyle: React.CSSProperties = {
    font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 64,
    background: 'var(--surface-2)', color: 'var(--ink)', borderRadius: 16, fontSize: 24, fontWeight: 600,
    display: 'grid', placeItems: 'center',
  };
  const mutedKeyStyle: React.CSSProperties = { ...keyStyle, background: 'transparent', border: 0, fontSize: 14, color: 'var(--ink-3)' };

  return (
    <div className="nido grain" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
        <div className="brand-mark" style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(150deg, var(--pine), var(--clay))', display: 'grid', placeItems: 'center', color: '#fff', margin: '0 auto 20px' }}>
          <Icon.lock />
        </div>
        <h1 className="serif" style={{ fontSize: 30, lineHeight: 1 }}>Hola, {cap(user?.username)}</h1>
        <p className="psub" style={{ marginTop: 8, marginBottom: 26 }}>Ingresa tu PIN para entrar</p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 30, ...(shake ? { animation: 'nido-shake .4s' } : null) }}>
          {[0, 1, 2, 3].map((i) => {
            const filled = pin.length > i;
            const color = error ? 'var(--berry)' : 'var(--clay)';
            return <span key={i} style={{ width: 16, height: 16, borderRadius: 16, background: filled ? color : 'var(--inset)', border: `1.5px solid ${filled ? color : 'var(--line-2)'}`, transition: 'all .15s' }} />;
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" style={keyStyle} onClick={() => handleDigit(String(n))}>{n}</button>
          ))}
          <button type="button" style={mutedKeyStyle} onClick={() => logout()}>Salir</button>
          <button type="button" style={keyStyle} onClick={() => handleDigit('0')}>0</button>
          <button type="button" style={mutedKeyStyle} onClick={handleDelete} aria-label="Borrar">⌫</button>
        </div>

        {error ? <p style={{ fontSize: 13, color: 'var(--berry)', marginTop: 18 }}>PIN incorrecto</p> : null}
      </div>
    </div>
  );
};
