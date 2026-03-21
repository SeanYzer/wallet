import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthContextType {
  activeUserId: string | null;
  isLoading: boolean;
  login: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('activeUserId').then(id => {
      if (id) setActiveUserId(id);
      setIsLoading(false);
    });
  }, []);

  const login = async (userId: string) => {
    await AsyncStorage.setItem('activeUserId', userId);
    setActiveUserId(userId);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('activeUserId');
    setActiveUserId(null);
  };

  return (
    <AuthContext.Provider value={{ activeUserId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
