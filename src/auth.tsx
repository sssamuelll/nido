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
    const userData = localStorage.getItem('user');
    
    if (userData) {
      try {
        setUser(JSON.parse(userData));
        // Start locked if we have a session
        setIsLocked(true);
      } catch (error) {
        console.error('Invalid user data in localStorage:', error);
        localStorage.removeItem('user');
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await Api.login(username, password);
      
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

// PIN Entry Page Component
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
    <div className="login-container">
      <div className="login-card fade-in text-center">
        <h1 className="login-title">🏠 Nido</h1>
        <p className="text-secondary mb-4">Hola, {user?.username === 'samuel' ? 'Samuel' : 'María'}</p>
        
        <div className="pin-display mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`pin-dot ${pin.length > i ? 'active' : ''} ${error ? 'error' : ''}`}
            />
          ))}
        </div>

        <div className="pin-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} onClick={() => handleNumberClick(n.toString())} className="pin-btn">
              {n}
            </button>
          ))}
          <button onClick={() => logout()} className="pin-btn text-sm">Salir</button>
          <button onClick={() => handleNumberClick('0')} className="pin-btn">0</button>
          <button onClick={handleDelete} className="pin-btn">⌫</button>
        </div>
        
        {error && <p className="text-error mt-4">PIN incorrecto</p>}
      </div>
    </div>
  );
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