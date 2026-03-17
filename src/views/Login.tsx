import React, { useState } from 'react';
import { useAuth } from '../auth';
import { InputField } from '../components/InputField';
import { Button } from '../components/Button';

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
    <div className="login">
      <div className="login__hero">
        <div className="login__orb login__orb--1" />
        <div className="login__orb login__orb--2" />
        <div className="login__orb login__orb--3" />
        <div className="login__logo">
          <div className="login__logo-icon"><span>N</span></div>
          <span className="login__logo-text">nido</span>
        </div>
        <h1 className="login__tagline">Tu hogar financiero<br />como pareja</h1>
        <p className="login__subtitle">
          Gestiona gastos compartidos, ahorra juntos<br />y alcanza vuestras metas financieras
        </p>
        <div className="login__badges">
          {['💚 Presupuestos', '🎯 Objetivos', '📊 Analytics', '💙 Compartido'].map((f) => (
            <span key={f} className="login__badge">{f}</span>
          ))}
        </div>
      </div>

      <div className="login__form-side">
        <div className="login__form-container">
          <div>
            <h2 className="login__form-title">Bienvenido de vuelta</h2>
            <p className="login__form-subtitle">
              {isMagicLinkEnabled ? 'Entra con magic link y deja el fallback clásico como red de seguridad' : 'Entra en vuestro nido financiero'}
            </p>
          </div>

          {isMagicLinkEnabled && (
            <form className="login__form" onSubmit={handleMagicLinkSubmit}>
              <InputField
                label="EMAIL"
                placeholder="samuel@... o maria@..."
                value={email}
                onChange={setEmail}
                disabled={isLoading || magicLinkSent}
              />

              {magicLinkSent ? (
                <div style={{ color: 'var(--color-success, #8bdc6b)', fontFamily: 'var(--font-body)', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
                  Revisa tu email y abre el magic link en este dispositivo para terminar el acceso.
                </div>
              ) : null}

              <Button
                label={isLoading ? 'Enviando...' : 'Enviar magic link'}
                variant="samuel"
                type="submit"
                fullWidth
                disabled={isLoading || magicLinkSent}
              />
            </form>
          )}

          <form className="login__form" onSubmit={handleLegacySubmit}>
            <InputField
              label="USUARIO"
              placeholder="samuel o maria"
              value={username}
              onChange={setUsername}
              disabled={isLoading}
            />
            <InputField
              label="CONTRASEÑA"
              type="password"
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={setPassword}
              disabled={isLoading}
            />

            {error && <div className="error-view__msg u-text-center">{error}</div>}

            <Button
              label={isLoading ? 'Entrando...' : isMagicLinkEnabled ? 'Entrar con acceso clásico' : 'Iniciar Sesión'}
              variant="samuel"
              type="submit"
              fullWidth
              disabled={isLoading}
            />
          </form>
        </div>
      </div>
    </div>
  );
};
