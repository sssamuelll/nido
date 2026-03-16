import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { getOrCreateConfirmAttempt } from './authConfirmAttempt';

const getMagicLinkParams = (location: ReturnType<typeof useLocation>) => {
  const searchParams = new URLSearchParams(location.search);
  return {
    tokenHash: searchParams.get('token_hash'),
    type: searchParams.get('type'),
  };
};

export const AuthCallback: React.FC = () => {
  const { isAuthenticated, confirmMagicLink } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = React.useState('');
  const [isWorking, setIsWorking] = React.useState(true);

  React.useEffect(() => {
    const { tokenHash, type } = getMagicLinkParams(location);

    if (!tokenHash || !type) {
      setError('No se encontró un token_hash válido en el enlace.');
      setIsWorking(false);
      return;
    }

    const run = getOrCreateConfirmAttempt(tokenHash, type, () => confirmMagicLink(tokenHash, type));

    let isActive = true;

    run
      .then(() => {
        if (!isActive) return;
        navigate('/', { replace: true });
      })
      .catch((err: any) => {
        if (!isActive) return;
        setError(err.message || 'No se pudo completar el acceso');
        setIsWorking(false);
      });

    return () => {
      isActive = false;
    };
  }, [confirmMagicLink, location.search, navigate]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="loading-screen">
      <div className="loading-screen__logo"><span>N</span></div>
      <div className="loading-screen__text">
        {isWorking ? 'Confirmando acceso seguro...' : error}
      </div>
    </div>
  );
};
