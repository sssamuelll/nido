import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Api, ApiError } from './api';

interface User {
  id: number;
  username: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLocked: boolean;
  login: (username: string, password: string) => Promise<void>;
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
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
      setIsLocked(false);
    };

    const bootstrapSession = async () => {
      try {
        const response = await Api.getSession();
        localStorage.setItem('user', JSON.stringify(response.user));
        if (response.token) {
          localStorage.setItem('token', response.token);
        }
        setUser(response.user);
        // Backend in production currently has no PIN endpoints; keep session unlocked
        setIsLocked(false);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          return;
        }

        const userData = localStorage.getItem('user');
        if (userData) {
          try {
            setUser(JSON.parse(userData));
            setIsLocked(false);
          } catch (parseError) {
            console.error('Invalid user data in localStorage:', parseError);
            clearSession();
          }
        }
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

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await Api.login(username, password);

      if (response?.token) {
        localStorage.setItem('token', response.token);
      }

      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
      setIsLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new Error('Credenciales incorrectas');
      }
      throw new Error('Error al iniciar sesión');
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
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
      setIsLocked(false);
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      await Api.verifyPin(pin);
      setIsLocked(false);
      return true;
    } catch (error) {
      return false;
    }
  };

  const value = {
    user,
    isLoading,
    isLocked,
    login,
    logout,
    verifyPin,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};