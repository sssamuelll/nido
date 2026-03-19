import React, { useState } from 'react';
import { useAuth } from '../auth';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, startMagicLink, isMagicLinkEnabled } = useAuth();

  const handleLegacySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) { setError('Por favor ingresa tu usuario'); return; }
    if (!password) { setError('Por favor ingresa la contraseña'); return; }

    try {
      setIsLoading(true);
      setError('');
      await login(username, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Por favor ingresa tu email'); return; }

    try {
      setIsLoading(true);
      setError('');
      await startMagicLink(email.trim().toLowerCase());
      setMagicLinkSent(true);
    } catch (err: any) {
      setError(err.message);
      setMagicLinkSent(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page visible">
      {/* Left Side - Branding */}
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

      {/* Right Side - Forms */}
      <div className="login-right">
        <h2>Bienvenido de vuelta</h2>
        <div className="login-desc">
          {isMagicLinkEnabled
            ? 'Entra con magic link y deja el fallback clásico como red de seguridad'
            : 'Entra en vuestro nido financiero'}
        </div>

        {isMagicLinkEnabled && (
          <form onSubmit={handleMagicLinkSubmit}>
            <div className="login-field">
              <div className="label">Email</div>
              <input
                className="login-input"
                placeholder="samuel@... o maria@..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || magicLinkSent}
              />
            </div>

            {magicLinkSent && (
              <div style={{ color: 'var(--color-success, #8bdc6b)', fontFamily: 'var(--font-body)', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
                Revisa tu email y abre el magic link en este dispositivo para terminar el acceso.
              </div>
            )}

            <button
              className="login-btn"
              type="submit"
              disabled={isLoading || magicLinkSent}
            >
              {isLoading ? 'Enviando...' : 'Enviar magic link'}
            </button>
          </form>
        )}

        {isMagicLinkEnabled && (
          <div className="login-divider">o acceso clásico</div>
        )}

        <form onSubmit={handleLegacySubmit}>
          <div className="login-field">
            <div className="label">Usuario</div>
            <input
              className="login-input"
              placeholder="samuel o maria"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="login-field">
            <div className="label">Contraseña</div>
            <input
              className="login-input"
              type="password"
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-view__msg u-text-center">{error}</div>}

          <button
            className="login-btn"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? 'Entrando...' : isMagicLinkEnabled ? 'Entrar con acceso clásico' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};
