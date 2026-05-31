import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { LoadingScreen } from '../components/LoadingScreen';
import { Card, Eyebrow, Btn, Icon } from '../components/nido';

interface InviteInfo {
  household_name: string;
  invited_by: string;
  is_relink: boolean;
  relink_username?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
};

export const Invite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (!token) { setError('Token inválido'); setIsLoading(false); return; }
    Api.getInvite(token)
      .then((data) => { setInfo(data); setIsLoading(false); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Enlace inválido o expirado'); setIsLoading(false); });
  }, [token]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !info) return;
    if (!info.is_relink && !username.trim()) { setError('Ingresa tu nombre'); return; }
    try {
      setIsClaiming(true);
      setError('');
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await Api.getInviteRegisterOptions(token);
      const credential = await startRegistration(options);
      await Api.claimInvite(token, { username: info.is_relink ? undefined : username.trim(), credential });
      navigate('/', { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setIsClaiming(false);
    }
  };

  if (isLoading) return <LoadingScreen />;

  const shell = (inner: React.ReactNode) => (
    <div className="nido grain" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card pad style={{ width: '100%', maxWidth: 400, padding: '34px 30px', textAlign: 'center' }}>{inner}</Card>
    </div>
  );

  if (!info) {
    return shell(
      <>
        <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--berry-tint)', color: 'var(--berry)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}><Icon.x /></div>
        <h1 className="serif" style={{ fontSize: 26, lineHeight: 1.05 }}>Enlace inválido</h1>
        <p className="psub" style={{ marginTop: 10, marginBottom: 22 }}>{error || 'Este enlace ha expirado o ya fue utilizado.'}</p>
        <Btn variant="primary" onClick={() => navigate('/')} style={{ margin: '0 auto', justifyContent: 'center' }}>Ir al inicio</Btn>
      </>
    );
  }

  return shell(
    <>
      <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(150deg, var(--pine), var(--clay))', color: '#fff', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}><Icon.heart /></div>
      <h1 className="serif" style={{ fontSize: 26, lineHeight: 1.05 }}>{info.is_relink ? 'Nuevo dispositivo' : `Te invitaron a ${info.household_name}`}</h1>
      <p className="psub" style={{ marginTop: 10, marginBottom: 22 }}>
        {info.is_relink ? `Registra una passkey para ${info.relink_username}` : `${info.invited_by} te invitó a uniros en vuestro nido financiero.`}
      </p>
      <form onSubmit={handleClaim} style={{ textAlign: 'left' }}>
        {!info.is_relink ? (
          <>
            <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Tu nombre</Eyebrow>
            <input style={inputStyle} placeholder="Ej: María" value={username} onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }} disabled={isClaiming} autoFocus maxLength={30} />
          </>
        ) : null}
        {error ? <div style={{ fontSize: 13, color: 'var(--berry)', marginTop: 12 }}>{error}</div> : null}
        <Btn variant="primary" type="submit" disabled={isClaiming} style={{ width: '100%', justifyContent: 'center', height: 50, fontSize: 16, marginTop: 18 }}>
          <Icon.check /> {isClaiming ? 'Registrando…' : info.is_relink ? 'Registrar dispositivo' : 'Unirme'}
        </Btn>
      </form>
    </>
  );
};
