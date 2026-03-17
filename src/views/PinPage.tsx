import React, { useState } from 'react';
import { useAuth } from '../auth';
import { NumpadKey } from '../components/NumpadKey';

export const PinPage: React.FC = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const { user, verifyPin, logout } = useAuth();

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        handleVerify(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const handleVerify = async (pinToVerify: string) => {
    const success = await verifyPin(pinToVerify);
    if (!success) {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="pin-page">
      <div className="loading-screen__logo"><span>N</span></div>
      <p className="pin-page__title">
        Hola, {user?.username === 'samuel' ? 'Samuel' : 'María'}
      </p>

      <div className="pin-page__dots">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`pin-page__dot ${pin.length > i ? 'pin-page__dot--filled' : ''} ${error ? 'pin-page__dot--error' : ''}`}
          />
        ))}
      </div>

      <div className="pin-page__numpad">
        <div className="pin-page__numpad-row">
          {[1, 2, 3].map((n) => (
            <NumpadKey key={n} label={n.toString()} onClick={() => handleNumberClick(n.toString())} />
          ))}
        </div>
        <div className="pin-page__numpad-row">
          {[4, 5, 6].map((n) => (
            <NumpadKey key={n} label={n.toString()} onClick={() => handleNumberClick(n.toString())} />
          ))}
        </div>
        <div className="pin-page__numpad-row">
          {[7, 8, 9].map((n) => (
            <NumpadKey key={n} label={n.toString()} onClick={() => handleNumberClick(n.toString())} />
          ))}
        </div>
        <div className="pin-page__numpad-row">
          <NumpadKey label="Salir" onClick={() => logout()} />
          <NumpadKey label="0" onClick={() => handleNumberClick('0')} />
          <NumpadKey label="⌫" onClick={handleDelete} variant="delete" />
        </div>
      </div>

      {error && <p className="error-view__msg">PIN incorrecto</p>}
    </div>
  );
};
