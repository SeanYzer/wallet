import { Stack } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider, useAppTheme } from "../context/ThemeContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import { TransactionsProvider } from "../context/TransactionsContext";
import { UserProfileProvider } from "../context/UserProfileContext";
import { CategoriesProvider } from "../context/CategoriesContext";
import { LanguageProvider } from "../context/LanguageContext";
import { PasscodeProvider, usePasscode } from "../context/PasscodeContext";
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

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <PasscodeProvider>
          <CurrencyProvider>
            <UserProfileProvider>
              <CategoriesProvider>
                <TransactionsProvider>
                  <MainLayout />
                </TransactionsProvider>
              </CategoriesProvider>
            </UserProfileProvider>
          </CurrencyProvider>
        </PasscodeProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
