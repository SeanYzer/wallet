import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { initMasterDb, initDb } from "../utils/db";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider, useAppTheme } from "../context/ThemeContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import { TransactionsProvider } from "../context/TransactionsContext";
import { UserProfileProvider } from "../context/UserProfileContext";
import { CategoriesProvider } from "../context/CategoriesContext";
import { LanguageProvider } from "../context/LanguageContext";
import { PasscodeProvider, usePasscode } from "../context/PasscodeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import PasscodeScreen from "./passcode-screen";

function MainLayout() {
  const { theme } = useAppTheme();
  const { isPasscodeEnabled, isUnlocked } = usePasscode();

  if (isPasscodeEnabled && !isUnlocked) {
      return <PasscodeScreen />;
  }

  return (
    <PaperProvider theme={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />

        {/* Main App with Bottom Tabs */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Modals / Sub-screens */}
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

  useEffect(() => {
    if (isLoading) return;
    
    if (activeUserId) {
        // Ensure the private DB for this user is initialized
        initDb(activeUserId).catch(e => console.error("User DB Init Error", e));
    }

    const inAuthGroup = segments[0] === 'auth';
    if (!activeUserId && !inAuthGroup) {
      router.replace('/auth');
    } else if (activeUserId && inAuthGroup) {
      router.replace('/');
    }
  }, [activeUserId, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Checking Accounts...</Text>
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
      .catch((e) => console.error("DB init Error", e));
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading WiseWallet...</Text>
      </View>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <PasscodeProvider>
            <CurrencyProvider>
              <UserProfileProvider>
                <CategoriesProvider>
                  <TransactionsProvider>
                    <AuthLoader>
                      <MainLayout />
                    </AuthLoader>
                  </TransactionsProvider>
                </CategoriesProvider>
              </UserProfileProvider>
            </CurrencyProvider>
          </PasscodeProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
