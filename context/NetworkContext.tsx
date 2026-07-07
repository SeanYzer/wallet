import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { API_URL } from "../utils/db";
import { processSyncQueue, triggerSyncProcessing } from "../utils/syncProcessor";

interface NetworkData {
  isOnline: boolean;
  isChecking: boolean;
  lastCheckedAt: number | null;
}

interface NetworkActions {
  checkConnectivity: () => Promise<boolean>;
}

const NetworkDataContext = createContext<NetworkData | undefined>(undefined);
const NetworkActionsContext = createContext<NetworkActions | undefined>(undefined);

const PING_ENDPOINT = "/system/health";
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
  }, [checkConnectivity]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkConnectivity();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkConnectivity]);

  const dataValue = useMemo(() => ({
    isOnline,
    isChecking,
    lastCheckedAt,
  }), [isOnline, isChecking, lastCheckedAt]);

  const actionsValue = useMemo(() => ({
    checkConnectivity,
  }), [checkConnectivity]);

  return (
    <NetworkDataContext.Provider value={dataValue}>
      <NetworkActionsContext.Provider value={actionsValue}>
        {children}
      </NetworkActionsContext.Provider>
    </NetworkDataContext.Provider>
  );
}

export function useNetworkData(): NetworkData {
  const context = useContext(NetworkDataContext);
  if (!context) {
    throw new Error("useNetworkData must be used within a NetworkProvider");
  }
  return context;
}

export function useNetworkActions(): NetworkActions {
  const context = useContext(NetworkActionsContext);
  if (!context) {
    throw new Error("useNetworkActions must be used within a NetworkProvider");
  }
  return context;
}

export function useNetwork(): NetworkData & NetworkActions {
  return { ...useNetworkData(), ...useNetworkActions() };
}

export function useIsOnline() {
  const context = useContext(NetworkDataContext);
  return context?.isOnline ?? true;
}
