import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';

export const Setup: React.FC = () => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Ingresa tu nombre');
      return;
    }
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
        <h2>Bienvenido a Nido</h2>
        <div className="login-desc">Crea tu cuenta para empezar</div>
        <form onSubmit={handleSetup}>
          <div className="login-field">
            <div className="label">Tu nombre</div>
            <input
              className="login-input"
              placeholder="Ej: Samuel"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>
          {error && <div className="error-view__msg u-text-center">{error}</div>}
          <button className="login-btn" type="submit" disabled={isLoading}>
            {isLoading ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
};
