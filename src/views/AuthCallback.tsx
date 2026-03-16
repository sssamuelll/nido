import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const getAccessTokenFromLocation = (location: ReturnType<typeof useLocation>) => {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : location.hash);
  return searchParams.get('access_token') || hashParams.get('access_token');
};

export const AuthCallback: React.FC = () => {
  const { isAuthenticated, finishMagicLinkLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = React.useState('');
  const [isWorking, setIsWorking] = React.useState(true);

  React.useEffect(() => {
    const accessToken = getAccessTokenFromLocation(location);

    if (!accessToken) {
      setError('No se encontró un access token válido en el enlace.');
      setIsWorking(false);
      return;
    }

    const run = async () => {
      try {
        await finishMagicLinkLogin(accessToken);
        navigate('/', { replace: true });
      } catch (err: any) {
        setError(err.message || 'No se pudo completar el acceso');
        setIsWorking(false);
      }
    };

    void run();
  }, [finishMagicLinkLogin, location, navigate]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="loading-screen">
      <div className="loading-screen__logo"><span>N</span></div>
      <div className="loading-screen__text">
        {isWorking ? 'Completando acceso seguro...' : error}
      </div>
    </div>
  );
};
