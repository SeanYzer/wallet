import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { API_URL } from "../utils/db";
import { processSyncQueue, triggerSyncProcessing } from "../utils/syncProcessor";

interface NetworkContextType {
  isOnline: boolean;
  isChecking: boolean;
  lastCheckedAt: number | null;
  checkConnectivity: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const PING_ENDPOINT = "/paymentMethods";
const PING_TIMEOUT = 3000;

async function checkConnection(): Promise<boolean> {
  if (!API_URL) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT);

  try {
    const response = await fetch(`${API_URL}${PING_ENDPOINT}`, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 200 || response.status === 404 || response.status === 405;
  } catch (e) {
    clearTimeout(timeoutId);
    return false;
  }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [wasOffline, setWasOffline] = useState(false);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (isChecking) return isOnline;

    setIsChecking(true);
    try {
      const online = await checkConnection();
      const wasPreviouslyOffline = !isOnline;

      if (online !== isOnline) {
        setIsOnline(online);

        if (online && wasPreviouslyOffline) {
          console.log("[Network] Back online - triggering sync queue processing");
          triggerSyncProcessing(100);
          await processSyncQueue();
        }
      }

      if (!online) {
        setWasOffline(true);
      } else if (wasOffline && online) {
        setWasOffline(false);
      }

      setLastCheckedAt(Date.now());
      return online;
    } catch (e) {
      console.error("[Network] Connectivity check error:", e);
      setIsOnline(false);
      setWasOffline(true);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, isOnline, wasOffline]);

  useEffect(() => {
    checkConnectivity();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      checkConnectivity();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkConnectivity]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        isChecking,
        lastCheckedAt,
        checkConnectivity,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}

export function useIsOnline() {
  const context = useContext(NetworkContext);
  return context?.isOnline ?? true;
}
