import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { Card, Eyebrow, Btn, Icon } from '../components/nido';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
};

export const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError('Ingresa tu nombre'); return; }
    try {
      setIsLoading(true);
      setError('');
      const { startRegistration } = await import('@simplewebauthn/browser');
      const { options, userId } = await Api.setupStart(username.trim());
      const credential = await startRegistration(options);
      await Api.setupFinish(userId, credential);
      navigate('/', { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cuenta');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="nido grain" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card pad style={{ width: '100%', maxWidth: 400, padding: '34px 30px', textAlign: 'center' }}>
        <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(150deg, var(--pine), var(--clay))', color: '#fff', fontFamily: 'var(--serif)', fontSize: 30, display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>n</div>
        <h1 className="serif" style={{ fontSize: 30, lineHeight: 1 }}>Bienvenido a Nido</h1>
        <p className="psub" style={{ marginTop: 8, marginBottom: 24 }}>Crea tu cuenta para empezar vuestro nido</p>
        <form onSubmit={handleSetup} style={{ textAlign: 'left' }}>
          <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Tu nombre</Eyebrow>
          <input style={inputStyle} placeholder="Ej: Samuel" value={username} onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }} disabled={isLoading} autoFocus maxLength={30} />
          {error ? <div style={{ fontSize: 13, color: 'var(--berry)', marginTop: 12 }}>{error}</div> : null}
          <Btn variant="primary" type="submit" disabled={isLoading} style={{ width: '100%', justifyContent: 'center', height: 52, fontSize: 16, marginTop: 18 }}>
            <Icon.check /> {isLoading ? 'Creando…' : 'Crear cuenta'}
          </Btn>
        </form>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16 }}>Usaremos una passkey de tu dispositivo para entrar de forma segura.</p>
      </Card>
    </div>
  );
};
