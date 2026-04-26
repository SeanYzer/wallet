import { Stack, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import { initMasterDb, initDb } from "../utils/db";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider, useAppTheme } from "../context/ThemeContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import { TransactionsProvider } from "../context/TransactionsContext";
import { UserProfileProvider, useUserProfile } from "../context/UserProfileContext";
import { CategoriesProvider } from "../context/CategoriesContext";
import { LanguageProvider } from "../context/LanguageContext";
import { PasscodeProvider, usePasscode } from "../context/PasscodeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import PasscodeScreen from "./passcode-screen";
import { DbRecoveryProvider } from "../context/DbRecoveryContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, hardResetLocalData } from "../utils/db";

function SystemResetManager() {
  const router = useRouter();
  const { logout } = useAuth();

  useEffect(() => {
    const checkReset = async () => {
      try {
        const response = await fetch(`${API_URL}/system/health`);
        if (!response.ok) return;

        const { data } = await response.json();
        const serverEpoch = data.reset_epoch;
        const localEpochStr = await AsyncStorage.getItem("system_reset_epoch");
        const localEpoch = localEpochStr ? parseInt(localEpochStr) : null;

        if (localEpoch === null) {
          // New install, just save the current epoch
          await AsyncStorage.setItem("system_reset_epoch", serverEpoch.toString());
        } else if (serverEpoch > localEpoch) {
          // RESET TRIGGERED
          console.warn("SYSTEM RESET TRIGGERED BY SERVER");
          await hardResetLocalData();
          await AsyncStorage.setItem("system_reset_epoch", serverEpoch.toString());
          
          if (Platform.OS === 'web') {
            window.location.reload();
          } else {
            router.replace("/auth");
            alert("A system reset was requested. You have been logged out.");
          }
        }
      } catch (e) {
        console.error("Health check failed", e);
      }
    };

    checkReset();
  }, []);

  return null;
}

function MainLayout() {
  const { theme } = useAppTheme();
  const { isPasscodeEnabled, isUnlocked } = usePasscode();
  const { activeUserId, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useUserProfile();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (authLoading || profileLoading || !navigationState?.key) return;
    
    const inAuthGroup = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';

    console.log(`[Nav] State -> User: ${activeUserId}, FirstRun: ${profile?.isFirstRun}, Path: /${segments.join('/')}`);
    
    if (!activeUserId && !inAuthGroup) {
      // 1. Not logged in -> Go to Auth
      console.log("[Nav] Redirecting to Auth");
      if (Platform.OS === 'web') {
        setTimeout(() => router.replace('/auth'), 0);
      } else {
        router.replace('/auth');
      }
    } else if (activeUserId) {
      if (profile?.isFirstRun && !inOnboarding) {
        // 2. Logged in but first run -> Go to Onboarding
        console.log("[Nav] Redirecting to Onboarding");
        if (Platform.OS === 'web') {
          setTimeout(() => router.replace('/onboarding'), 0);
        } else {
          router.replace('/onboarding');
        }
      } else if (!profile?.isFirstRun && (inAuthGroup || inOnboarding)) {
        // 3. Logged in and setup done -> Go to Home
        console.log("[Nav] Redirecting to Dashboard");
        if (Platform.OS === 'web') {
          setTimeout(() => router.replace('/'), 0);
        } else {
          router.replace('/');
        }
      }
    }
  }, [activeUserId, authLoading, profileLoading, profile?.isFirstRun, segments, navigationState?.key]);

  if (isPasscodeEnabled && !isUnlocked) {
      return <PasscodeScreen />;
  }

  return (
    <PaperProvider theme={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-transaction" options={{ presentation: "modal" }} />
        <Stack.Screen name="edit-transaction" options={{ presentation: "modal" }} />
        <Stack.Screen name="transaction-details" options={{ title: "Details" }} />
        <Stack.Screen name="budgets" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="agenda" />
        <Stack.Screen name="subscriptions" />
        <Stack.Screen name="savings" />
        <Stack.Screen name="payment-methods" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="learning-detail" options={{ animation: "slide_from_right" }} />
      </Stack>
    </PaperProvider>
  );
}

export function AuthLoader({ children }: { children: React.ReactNode }) {
  const { activeUserId, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [dbLoading, setDbLoading] = useState(false);
  const [dbInitializedFor, setDbInitializedFor] = useState<string | null>(null);

  // 1. Handle DB Initialization
  useEffect(() => {
    if (isLoading) return;
    
    if (activeUserId && activeUserId !== dbInitializedFor) {
        setDbLoading(true);
        initDb(activeUserId)
          .then(() => {
            setDbInitializedFor(activeUserId);
            setDbLoading(false);
          })
          .catch((e: any) => {
            console.error("User DB Init Error", e);
            setDbLoading(false);
          });
    } else if (!activeUserId) {
        setDbInitializedFor(null);
    }
  }, [activeUserId, isLoading]);

  // 2. Handle Navigation handled in MainLayout to avoid race-condition with Stack registration 
  
  if (isLoading || dbLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>{isLoading ? "Checking Accounts..." : "Preparing Database..."}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initMasterDb()
      .then(() => setDbReady(true))
      .catch((e: any) => console.error("DB init Error", e));
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading WiseWallet...</Text>
      </View>
    );
  }

  return (
    <DbRecoveryProvider>
      <AuthProvider>
        <UserProfileProvider>
          <SystemResetManager />
          <ThemeProvider>
            <LanguageProvider>
              <PasscodeProvider>
                <CurrencyProvider>
                  <AuthLoader>
                    <CategoriesProvider>
                      <TransactionsProvider>
                        <MainLayout />
                      </TransactionsProvider>
                    </CategoriesProvider>
                  </AuthLoader>
                </CurrencyProvider>
              </PasscodeProvider>
            </LanguageProvider>
          </ThemeProvider>
        </UserProfileProvider>
      </AuthProvider>
    </DbRecoveryProvider>
  );
}
