import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { LoadingScreen } from '../components/LoadingScreen';
import { Card, Eyebrow, Btn, Icon } from '../components/nido';

type ViewState = 'loading' | 'passkey' | 'pin' | 'migration-pin' | 'migration-register';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
};

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
        if (!status.hasUsers) { navigate('/setup', { replace: true }); return; }
        setView(status.needsPasskeyMigration ? 'migration-pin' : 'passkey');
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
      setIsWorking(true); setError('');
      await loginWithPasskey();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally { setIsWorking(false); }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) { setError('Ingresa tu PIN'); return; }
    try {
      setIsWorking(true); setError('');
      const response = await Api.pinLogin(pin);
      if (response.user) { navigate('/', { replace: true }); window.location.reload(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN incorrecto');
    } finally { setIsWorking(false); }
  };

  const handleMigrationPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) { setError('Ingresa tu PIN'); return; }
    try {
      setIsWorking(true); setError('');
      await Api.pinLogin(pin);
      setView('migration-register');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN incorrecto');
    } finally { setIsWorking(false); }
  };

  const handleMigrationRegister = async () => {
    try {
      setIsWorking(true); setError('');
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await Api.registerStart();
      const credential = await startRegistration(options);
      await Api.registerFinish(credential);
      navigate('/', { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar passkey');
    } finally { setIsWorking(false); }
  };

  const handleSkipMigration = () => { navigate('/', { replace: true }); window.location.reload(); };

  const showPinForm = () => { setError(''); setPin(''); setView('pin'); };

  if (view === 'loading') return <LoadingScreen />;

  const errorMsg = error ? <div style={{ fontSize: 13, color: 'var(--berry)', margin: '0 0 14px', textAlign: 'center' }}>{error}</div> : null;
  const linkBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ marginTop: 14, background: 'none', border: 0, color: 'var(--ink-3)', fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer', width: '100%' }}>{label}</button>
  );
  const pinInput = (
    <div style={{ marginBottom: 4 }}>
      <Eyebrow style={{ display: 'block', marginBottom: 8 }}>PIN</Eyebrow>
      <input style={inputStyle} type="password" inputMode="numeric" maxLength={6} placeholder="••••" value={pin} onChange={(e) => { setPin(e.target.value); if (error) setError(''); }} disabled={isWorking} autoFocus />
    </div>
  );

  const renderRight = () => {
    if (view === 'migration-pin') {
      return (
        <>
          <h2 className="serif" style={{ fontSize: 26 }}>Nido se actualizó</h2>
          <p className="psub" style={{ marginTop: 6, marginBottom: 20 }}>Ingresa tu PIN para registrar tu passkey</p>
          <form onSubmit={handleMigrationPinSubmit}>
            {pinInput}
            {errorMsg}
            <Btn variant="primary" type="submit" disabled={isWorking} style={{ width: '100%', justifyContent: 'center', height: 50, fontSize: 16, marginTop: 10 }}>{isWorking ? 'Verificando…' : 'Verificar'}</Btn>
          </form>
        </>
      );
    }
    if (view === 'migration-register') {
      return (
        <>
          <h2 className="serif" style={{ fontSize: 26 }}>Registrar passkey</h2>
          <p className="psub" style={{ marginTop: 6, marginBottom: 20 }}>Tu PIN fue verificado. Ahora registra una passkey para acceder de forma segura.</p>
          {errorMsg}
          <Btn variant="primary" onClick={handleMigrationRegister} disabled={isWorking} style={{ width: '100%', justifyContent: 'center', height: 50, fontSize: 16 }}>{isWorking ? 'Registrando…' : 'Registrar passkey'}</Btn>
          {linkBtn('Omitir por ahora', handleSkipMigration)}
        </>
      );
    }
    if (view === 'pin') {
      return (
        <>
          <h2 className="serif" style={{ fontSize: 26 }}>Iniciar con PIN</h2>
          <p className="psub" style={{ marginTop: 6, marginBottom: 20 }}>Ingresa tu PIN de 4 dígitos</p>
          <form onSubmit={handlePinLogin}>
            {pinInput}
            {errorMsg}
            <Btn variant="primary" type="submit" disabled={isWorking} style={{ width: '100%', justifyContent: 'center', height: 50, fontSize: 16, marginTop: 10 }}>{isWorking ? 'Entrando…' : 'Entrar'}</Btn>
          </form>
          {linkBtn('← Usar passkey', () => { setView('passkey'); setError(''); })}
        </>
      );
    }
    return (
      <>
        <h2 className="serif" style={{ fontSize: 26 }}>Bienvenido de vuelta</h2>
        <p className="psub" style={{ marginTop: 6, marginBottom: 20 }}>Entra en vuestro nido financiero</p>
        {errorMsg}
        <Btn variant="primary" onClick={handlePasskeyLogin} disabled={isWorking} style={{ width: '100%', justifyContent: 'center', height: 50, fontSize: 16 }}>{isWorking ? 'Autenticando…' : 'Iniciar sesión'}</Btn>
        {linkBtn('Usar PIN', showPinForm)}
      </>
    );
  };

  return (
    <div className="nido grain" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card pad style={{ width: '100%', maxWidth: 400, padding: '34px 30px', textAlign: 'center' }}>
        <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(150deg, var(--pine), var(--clay))', color: '#fff', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}><Icon.heart /></div>
        {renderRight()}
      </Card>
    </div>
  );
};
