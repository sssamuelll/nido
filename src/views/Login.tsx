import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';

type ViewState = 'loading' | 'passkey' | 'pin' | 'migration-pin' | 'migration-register';

export const Login: React.FC = () => {
  const [view, setView] = useState<ViewState>('loading');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [pin, setPin] = useState('');
  const { loginWithPasskey } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await Api.getSetupStatus();
        if (!status.hasUsers) {
          navigate('/setup', { replace: true });
          return;
        }
        if (status.needsPasskeyMigration) {
          setView('migration-pin');
        } else {
          setView('passkey');
        }
      } catch (err) {
        console.error('Failed to check setup status:', err);
        setError('No se pudo conectar con el servidor');
        setView('passkey');
      }
    };
    void checkStatus();
  }, [navigate]);

  const handlePasskeyLogin = async () => {
    try {
      setIsWorking(true);
      setError('');
      await loginWithPasskey();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setIsWorking(false);
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setError('Ingresa tu PIN');
      return;
    }
    try {
      setIsWorking(true);
      setError('');
      const response = await Api.pinLogin(pin);
      if (response.user) {
        navigate('/', { replace: true });
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN incorrecto');
    } finally {
      setIsWorking(false);
    }
  };

  const handleMigrationPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setError('Ingresa tu PIN');
      return;
    }
    try {
      setIsWorking(true);
      setError('');
      await Api.pinLogin(pin);
      setView('migration-register');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN incorrecto');
    } finally {
      setIsWorking(false);
    }
  };

  const handleMigrationRegister = async () => {
    try {
      setIsWorking(true);
      setError('');
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await Api.registerStart();
      const credential = await startRegistration(options);
      await Api.registerFinish(credential);
      navigate('/', { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar passkey');
    } finally {
      setIsWorking(false);
    }
  };

  const handleSkipMigration = () => {
    // User already has a session from PIN login — just go to the app
    navigate('/', { replace: true });
    window.location.reload();
  };

  const showPinForm = () => {
    setError('');
    setPin('');
    setView('pin');
  };

  if (view === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-screen__logo"><span>N</span></div>
        <div className="loading-screen__text">Cargando...</div>
      </div>
    );
  }

  const renderRight = () => {
    // Migration: PIN input (no username needed)
    if (view === 'migration-pin') {
      return (
        <>
          <h2>Nido se actualiz&oacute;</h2>
          <div className="login-desc">Ingresa tu PIN para registrar tu passkey</div>
          <form onSubmit={handleMigrationPinSubmit}>
            <div className="login-field">
              <div className="label">PIN</div>
              <input
                className="login-input"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="****"
                value={pin}
                onChange={e => setPin(e.target.value)}
                disabled={isWorking}
                autoFocus
              />
            </div>
            {error && <div className="error-view__msg u-text-center">{error}</div>}
            <button className="login-btn" type="submit" disabled={isWorking}>
              {isWorking ? 'Verificando...' : 'Verificar'}
            </button>
          </form>
        </>
      );
    }

    // Migration: register passkey after PIN verified
    if (view === 'migration-register') {
      return (
        <>
          <h2>Registrar passkey</h2>
          <div className="login-desc">
            Tu PIN fue verificado. Ahora registra una passkey para acceder de forma segura.
          </div>
          {error && <div className="error-view__msg u-text-center">{error}</div>}
          <button className="login-btn" onClick={handleMigrationRegister} disabled={isWorking}>
            {isWorking ? 'Registrando...' : 'Registrar passkey'}
          </button>
          <button
            className="login-link"
            onClick={handleSkipMigration}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}
          >
            Omitir por ahora
          </button>
        </>
      );
    }

    // PIN fallback login
    if (view === 'pin') {
      return (
        <>
          <h2>Iniciar con PIN</h2>
          <div className="login-desc">Ingresa tu PIN de 4 d&iacute;gitos</div>
          <form onSubmit={handlePinLogin}>
            <div className="login-field">
              <div className="label">PIN</div>
              <input
                className="login-input"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="****"
                value={pin}
                onChange={e => setPin(e.target.value)}
                disabled={isWorking}
                autoFocus
              />
            </div>
            {error && <div className="error-view__msg u-text-center">{error}</div>}
            <button className="login-btn" type="submit" disabled={isWorking}>
              {isWorking ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <button
            className="login-link"
            onClick={() => { setView('passkey'); setError(''); }}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}
          >
            &larr; Usar passkey
          </button>
        </>
      );
    }

    // Default: passkey login
    return (
      <>
        <h2>Bienvenido de vuelta</h2>
        <div className="login-desc">Entra en vuestro nido financiero</div>
        {error && <div className="error-view__msg u-text-center">{error}</div>}
        <button className="login-btn" onClick={handlePasskeyLogin} disabled={isWorking}>
          {isWorking ? 'Autenticando...' : 'Iniciar sesión'}
        </button>
        <button
          className="login-link"
          onClick={showPinForm}
          style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}
        >
          Usar PIN
        </button>
      </>
    );
  };

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
        <div className="login-pills">
          <div className="login-pill">
            <svg width="14" height="14" fill="none" stroke="#34D399" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 12l2 2 4-4" /></svg>
            Presupuestos
          </div>
          <div className="login-pill">
            <svg width="14" height="14" fill="none" stroke="#FBBF24" viewBox="0 0 24 24" strokeWidth="2"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4" /></svg>
            Objetivos
          </div>
          <div className="login-pill">
            <svg width="14" height="14" fill="none" stroke="#60A5FA" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6" /></svg>
            Analytics
          </div>
          <div className="login-pill">
            <svg width="14" height="14" fill="none" stroke="#A78BFA" viewBox="0 0 24 24" strokeWidth="2"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            Compartido
          </div>
        </div>
      </div>
      <div className="login-right">
        {renderRight()}
      </div>
    </div>
  );
};
