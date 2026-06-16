import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";
import { API_URL } from "../utils/db";
import { setAuthFailureCallback } from "../utils/apiClient";
import { setCachedUserId } from "../utils/cache";

interface AuthContextType {
  activeUserId: string | null;
  token: string | null;
  isLoading: boolean;
  login: (userId: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('activeUserId'),
      AsyncStorage.getItem('authToken')
    ]).then(([id, t]) => {
      if (id) {
        setActiveUserId(id);
        setCachedUserId(id);
      }
      if (t) setToken(t);
      setIsLoading(false);
    });
  }, []);

  const handleAuthFailure = useCallback(() => {
    setActiveUserId(null);
    setToken(null);
  }, []);

  useEffect(() => {
    setAuthFailureCallback(handleAuthFailure);
    return () => setAuthFailureCallback(() => {});
  }, [handleAuthFailure]);

  const login = async (userId: string, token: string) => {
    await AsyncStorage.setItem('authToken', token);
    await AsyncStorage.setItem('activeUserId', String(userId));
    setActiveUserId(String(userId));
    setCachedUserId(String(userId));
    setToken(token);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('activeUserId');
    await AsyncStorage.removeItem('authToken');
    setActiveUserId(null);
    setCachedUserId(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ activeUserId, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
