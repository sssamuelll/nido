import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Api, ApiError } from './api';

interface User {
  id: number;
  username: string;
  email?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLocked: boolean;
  startMagicLink: (email: string) => Promise<void>;
  confirmMagicLink: (tokenHash: string, type: string) => Promise<void>;
  finishMagicLinkLogin: (accessToken: string) => Promise<void>;
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
          console.error('Failed to bootstrap auth session:', error);
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

  const startMagicLink = async (email: string) => {
    try {
      await Api.startMagicLink(email);
    } catch (error) {
      throw new Error('No se pudo enviar el magic link');
    }
  };

  const finishMagicLinkLogin = async (accessToken: string) => {
    try {
      setIsLoading(true);
      const response = await Api.exchangeSession(accessToken);
      setUser(response.user);
      setIsLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new Error('El enlace ha expirado o no es válido.');
      }
      throw new Error('No se pudo completar el acceso con magic link');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmMagicLink = async (tokenHash: string, type: string) => {
    try {
      setIsLoading(true);
      const response = await Api.confirmMagicLink(tokenHash, type);
      setUser(response.user);
      setIsLocked(false);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 422)) {
        throw new Error('El enlace ha expirado, no es válido o no está permitido.');
      }
      throw new Error('No se pudo confirmar el magic link');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await Api.logout();
    } catch (error) {
      console.error('Logout error:', error);
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
    startMagicLink,
    confirmMagicLink,
    finishMagicLinkLogin,
    logout,
    verifyPin,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
