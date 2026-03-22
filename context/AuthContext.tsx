import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

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
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(7);
    await AsyncStorage.setItem('activeUserId', userId);
    await AsyncStorage.setItem('localSessionId', sessionId);
    setActiveUserId(userId);

    // Register active session to API
    fetch(`${API_URL}/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentSessionId: sessionId }),
    }).catch(e => console.error("Failed to update session ID on server", e));
  };

  const logout = async () => {
    await AsyncStorage.removeItem('activeUserId');
    await AsyncStorage.removeItem('localSessionId');
    setActiveUserId(null);
  };

  useEffect(() => {
    if (!activeUserId) return;

    const interval = setInterval(async () => {
      try {
        const localSessionId = await AsyncStorage.getItem('localSessionId');
        if (!localSessionId) return;

        const res = await fetch(`${API_URL}/users/${activeUserId}`);
        if (!res.ok) return;

        const user = await res.json();
        // Compare server session with local session
        if (user && user.currentSessionId && user.currentSessionId !== localSessionId) {
          console.warn("Session expired due to login from another device.");
          clearInterval(interval);
          
          if (Platform.OS === 'web') {
            window.alert("You have been logged out because your account was accessed from another device.");
          } else {
            Alert.alert("Session Expired", "You have been logged out because your account was accessed from another device.");
          }
          await logout();
        }
      } catch (e) {
        // Silently ignore network errors to not interrupt user if they just go offline
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [activeUserId]);

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
