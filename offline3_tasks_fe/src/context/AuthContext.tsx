import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authService, onAccountBanned, onUnauthorized } from '../services/api';

interface AuthContextType {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isBannedModalOpen: boolean;
  bannedMessage: string | null;
  closeBannedModal: () => void;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  rehydrate: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBannedModalOpen, setIsBannedModalOpen] = useState<boolean>(false);
  const [bannedMessage, setBannedMessage] = useState<string | null>(null);

  const closeBannedModal = useCallback(() => {
    setIsBannedModalOpen(false);
    setBannedMessage(null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
  }, []);

  const rehydrate = useCallback(async () => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) {
      setCurrentUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const user = await authService.getMe();
      setCurrentUser(user);
      setToken(savedToken);
    } catch {
      // Token is invalid, expired, or user is banned
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for account banned or 401 events from Axios interceptors
  useEffect(() => {
    const unsubscribeBanned = onAccountBanned((detail) => {
      logout();
      setBannedMessage(detail || 'Your account is temporarily banned. Please contact support or an administrator.');
      setIsBannedModalOpen(true);
    });

    const unsubscribeUnauthorized = onUnauthorized(() => {
      logout();
    });

    rehydrate();

    return () => {
      unsubscribeBanned();
      unsubscribeUnauthorized();
    };
  }, [logout, rehydrate]);

  const login = async (usernameOrEmail: string, password: string) => {
    const tokenData = await authService.login(usernameOrEmail, password);
    localStorage.setItem('token', tokenData.access_token);
    setToken(tokenData.access_token);
    const user = await authService.getMe();
    localStorage.setItem('user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const register = async (username: string, email: string, password: string) => {
    return await authService.register({ username, email, password });
  };

  const isAuthenticated = !!currentUser && !!token;
  const isAdmin = currentUser?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        token,
        isAuthenticated,
        isAdmin,
        isLoading,
        isBannedModalOpen,
        bannedMessage,
        closeBannedModal,
        login,
        register,
        logout,
        rehydrate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
