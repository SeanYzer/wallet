import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { initDb, initMasterDb, clearAllLocalData, setOnFatalError } from '../utils/db';

const DbRecoveryContext = createContext<{
  triggerRecovery: () => void;
}>({
  triggerRecovery: () => {},
});

export const useDbRecovery = () => useContext(DbRecoveryContext);

export const DbRecoveryProvider = ({ children }: { children: React.ReactNode }) => {
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    setOnFatalError(() => {
      setIsRecovering(true);
    });
  }, []);

  const triggerRecovery = () => {
    setIsRecovering(true);
  };

  useEffect(() => {
    if (isRecovering) {
      const performRecovery = async () => {
        try {
          console.warn("Self-Healing: Starting database recovery sequence...");
          // 1. Wipe everything in AsyncStorage
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.clear();
          
          // 2. Re-init master (stubs)
          await initMasterDb();
          // 3. Re-init user DB (stubs)
          await initDb();
          console.log("Self-Healing: Recovery successful.");
        } catch (e) {
          console.error("Self-Healing: Recovery sequence failed", e);
        } finally {
          setIsRecovering(false);
          // Optional: Force a reload or just let React remount
        }
      };
      performRecovery();
    }
  }, [isRecovering]);

  if (isRecovering) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.title}>Recovering App State...</Text>
        <Text style={styles.subtitle}>Healing database connections and restoring stability.</Text>
      </View>
    );
  }

  return (
    <DbRecoveryContext.Provider value={{ triggerRecovery }}>
      {children}
    </DbRecoveryContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    marginTop: 24,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
