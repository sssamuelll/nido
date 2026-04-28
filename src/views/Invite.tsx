import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { LoadingScreen } from '../components/LoadingScreen';

interface InviteInfo {
  household_name: string;
  invited_by: string;
  is_relink: boolean;
  relink_username?: string;
}

export const Invite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token inválido');
      setIsLoading(false);
      return;
    }
    Api.getInvite(token)
      .then(data => {
        setInfo(data);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Enlace inválido o expirado');
        setIsLoading(false);
      });
  }, [token]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !info) return;
    if (!info.is_relink && !username.trim()) {
      setError('Ingresa tu nombre');
      return;
    }
    try {
      setIsClaiming(true);
      setError('');
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await Api.getInviteRegisterOptions(token);
      const credential = await startRegistration(options);
      await Api.claimInvite(token, {
        username: info.is_relink ? undefined : username.trim(),
        credential,
      });
      navigate('/', { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setIsClaiming(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="login-page visible">
      <div className="login-left">
        <div className="login-mesh">
          <div className="mesh-orb orb1" />
          <div className="mesh-orb orb2" />
          <div className="mesh-orb orb3" />
        </div>
        <div className="login-brand">
          <div className="brand-icon">N</div>
          <span>nido</span>
        </div>
        <div className="login-headline">Tu hogar financiero como pareja</div>
        <div className="login-sub">
          Gestiona gastos compartidos, ahorra juntos y alcanza vuestras metas financieras
        </div>
      </div>
      <div className="login-right">
        {!info ? (
          <>
            <h2>Enlace inválido</h2>
            <div className="error-view__msg u-text-center">
              {error || 'Este enlace ha expirado o ya fue utilizado.'}
            </div>
          </>
        ) : (
          <>
            <h2>{info.is_relink ? 'Nuevo dispositivo' : 'Te invitaron a Nido'}</h2>
            <div className="login-desc">
              {info.is_relink
                ? `Registra passkey para ${info.relink_username}`
                : `${info.invited_by} te invitó a ${info.household_name}`}
            </div>
            <form onSubmit={handleClaim}>
              {!info.is_relink && (
                <div className="login-field">
                  <div className="label">Tu nombre</div>
                  <input
                    className="login-input"
                    placeholder="Ej: María"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    disabled={isClaiming}
                  />
                </div>
              )}
              {error && <div className="error-view__msg u-text-center">{error}</div>}
              <button className="login-btn" type="submit" disabled={isClaiming}>
                {isClaiming
                  ? 'Registrando...'
                  : info.is_relink
                    ? 'Registrar dispositivo'
                    : 'Unirme'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
