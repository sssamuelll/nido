import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Api, ApiError } from './api';

interface User {
  id: number;
  username: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
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

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (error) {
        console.error('Invalid user data in localStorage:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await Api.login(username, password);
      
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new Error('Credenciales incorrectas');
      }
      throw new Error('Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Login Page Component
export const LoginPage: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser) {
      setError('Por favor selecciona un usuario');
      return;
    }
    
    if (!password) {
      setError('Por favor ingresa la contraseña');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await login(selectedUser, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card fade-in">
        <h1 className="login-title">🏠 Nido</h1>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">¿Quién eres?</label>
            <div className="avatar-selection">
              <button
                type="button"
                className={`avatar-option ${selectedUser === 'samuel' ? 'selected' : ''}`}
                onClick={() => setSelectedUser('samuel')}
              >
                👨‍💻
              </button>
              <button
                type="button"
                className={`avatar-option ${selectedUser === 'maria' ? 'selected' : ''}`}
                onClick={() => setSelectedUser('maria')}
              >
                👩‍🎨
              </button>
            </div>
            {selectedUser && (
              <div className="text-center text-accent font-medium">
                Hola, {selectedUser === 'samuel' ? 'Samuel' : 'María'}!
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-center text-error mb-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={isLoading || !selectedUser}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};