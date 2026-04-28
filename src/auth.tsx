import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Api, ApiError } from './api';
import { handleApiError } from './lib/handleApiError';

interface User {
  id: number;
  username: string;
  email?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLocked: boolean;
  loginWithPasskey: () => Promise<void>;
  registerPasskey: () => Promise<void>;
  logout: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const clearSession = () => {
      setUser(null);
      setIsLocked(false);
    };

    const bootstrapSession = async () => {
      try {
        const response = await Api.getMe();
        setUser(response.user);
        setIsLocked(false);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          // Bootstrap is implicit; the visible state (login screen) is the
          // user's signal. A toast would surface as noise on a screen they
          // are already looking at for the same reason.
          handleApiError(error, 'Failed to bootstrap auth session', { silent: true });
        }
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    Api.setUnauthorizedHandler(clearSession);
    void bootstrapSession();

    return () => {
      Api.setUnauthorizedHandler(null);
    };
  }, []);

  const loginWithPasskey = async () => {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    setIsLoading(true);
    try {
      const options = await Api.loginStart();
      const credential = await startAuthentication(options);
      const response = await Api.loginFinish(credential);
      setUser(response.user);
      setIsLocked(false);
    } finally {
      setIsLoading(false);
    }
  };

  const registerPasskey = async () => {
    const { startRegistration } = await import('@simplewebauthn/browser');
    const options = await Api.registerStart();
    const credential = await startRegistration(options);
    await Api.registerFinish(credential);
  };

  const logout = async () => {
    try {
      await Api.logout();
    } catch (error) {
      // Logout always clears local state in `finally`. Even if the server
      // call fails the user's session is gone client-side; a toast would
      // imply they're still logged in, which is misleading.
      handleApiError(error, 'Logout error', { silent: true });
    } finally {
      setUser(null);
      setIsLocked(false);
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      await Api.verifyPin(pin);
      setIsLocked(false);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const value = {
    user,
    isLoading,
    isLocked,
    loginWithPasskey,
    registerPasskey,
    logout,
    verifyPin,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
