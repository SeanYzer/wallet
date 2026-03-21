import { View, ActivityIndicator, ScrollView, TouchableOpacity } from "react-native";
import { FAB, Appbar, Text, Button, Card, IconButton } from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useRouter, useFocusEffect, Redirect } from "expo-router";
import { useCallback } from "react";
import { useAppTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useBudgets } from "../../hooks/useBudgets";
import { useSubscriptions } from "../../hooks/useSubscriptions";
import { useCurrency } from "../../context/CurrencyContext";
import { useUserProfile } from "../../context/UserProfileContext";
import { Subscription } from "../../types";
import { SummaryCard } from "../../components/SummaryCard";
import { ChartCard } from "../../components/ChartCard";
import { TransactionList } from "../../components/TransactionList";
import { FinancialTip } from "../../components/FinancialTip";
import { BudgetCard } from "../../components/BudgetCard";

export default function Dashboard() {
  const router = useRouter();
  const { profile, isLoading: profileLoading } = useUserProfile();
  const { transactions, loading: txLoading, refetch: refetchTx } = useTransactions();
  const { budgets, loading: budgetsLoading, refetch: refetchBudgets } = useBudgets();
  const { subscriptions, refetch: refetchSubs } = useSubscriptions();
  const { formatAmount } = useCurrency();
  const { theme } = useAppTheme();
  const { activeUserId } = useAuth();

  const loading = txLoading || budgetsLoading;

  useFocusEffect(
    useCallback(() => {
      if (activeUserId) {
        refetchTx();
        refetchBudgets();
        refetchSubs();
      }
    }, [activeUserId])
  );

  if (!activeUserId) return null; // Let AuthLoader handle redirection

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (loading && transactions.length === 0 && budgets.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentBudgets = budgets.filter(b => b.month === currentMonth);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20, backgroundColor: theme.colors.background, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text variant="labelSmall" style={{ color: theme.colors.outline, letterSpacing: 1 }}>HELLO,</Text>
            <Text variant="titleLarge" style={{ fontWeight: "700" }}>{profile?.name || "User"}</Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <IconButton icon="bell-outline" size={24} onPress={() => router.push("/subscriptions")} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 8 }}>
          <SummaryCard transactions={transactions} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 20 }}>
          {[
            { label: "Budgets", icon: "wallet-outline", path: "/budgets" },
            { label: "Agenda", icon: "calendar-check-outline", path: "/agenda" },
            { label: "Savings", icon: "piggy-bank-outline", path: "/savings" },
          ].map((item) => (
            <TouchableOpacity
              key={item.path}
              onPress={() => router.push(item.path as any)}
              style={{ width: "23%", alignItems: "center", marginBottom: 16 }}
            >
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: theme.colors.surface,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 8,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2
              }}>
                <MaterialCommunityIcons name={item.icon as any} size={26} color={theme.colors.primary} />
              </View>
              <Text variant="labelSmall" style={{ fontWeight: "600", color: theme.colors.onSurfaceVariant }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {currentBudgets.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 }}>
              <Text variant="titleMedium" style={{ fontWeight: "700" }}>Monthly Budgets</Text>
              <TouchableOpacity onPress={() => router.push("/budgets")}>
                <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: "600" }}>View All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
              {currentBudgets.map(budget => (
                <View key={budget.id} style={{ width: 280, marginHorizontal: 8 }}>
                  <BudgetCard budget={budget} transactions={transactions} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {(() => {
          const soon = subscriptions.filter(sub => {
            const today = new Date().getDate();
            let daysLeft;
            if (sub.dueDate >= today) {
              daysLeft = sub.dueDate - today;
            } else {
              const daysInCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
              daysLeft = (daysInCurrentMonth - today) + sub.dueDate;
            }
            return daysLeft <= 3 && daysLeft >= 0;
          });

          if (soon.length === 0) return null;

          const todayDay = new Date().getDate();

          return (
            <View style={{ marginTop: 24, paddingHorizontal: 20 }}>
              <Text variant="titleMedium" style={{ fontWeight: "700", marginBottom: 12 }}>Upcoming Bills</Text>
              {soon.map(sub => {
                const daysUntil = sub.dueDate >= todayDay ? sub.dueDate - todayDay : (new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - todayDay) + sub.dueDate;
                return (
                  <Card key={sub.id} style={{ marginBottom: 12, backgroundColor: "#FFF5F5", borderRadius: 16 }} onPress={() => router.push("/subscriptions")}>
                    <Card.Content style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#FFE0E0", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                          <MaterialCommunityIcons name="bell-alert-outline" size={20} color="#E53935" />
                        </View>
                        <View>
                          <Text variant="bodyLarge" style={{ fontWeight: "700" }}>{sub.name}</Text>
                          <Text variant="labelSmall" style={{ color: "#E53935", fontWeight: "600" }}>Due in {daysUntil} days</Text>
                        </View>
                      </View>
                      <Text variant="titleMedium" style={{ fontWeight: "800" }}>{formatAmount(sub.amount)}</Text>
                    </Card.Content>
                  </Card>
                );
              })}
            </View>
          );
        })()}

        <View style={{ marginTop: 8 }}>
          <FinancialTip />
        </View>

        <View style={{ marginTop: 8 }}>
          <TransactionList transactions={transactions} />
        </View>
      </ScrollView>

      <FAB
        icon="plus"
        label="Transaction"
        style={{ position: "absolute", margin: 20, right: 0, bottom: 20, borderRadius: 20, backgroundColor: theme.colors.primary }}
        color="#fff"
        onPress={() => router.push("/add-transaction")}
      />
    </View>
  );
}
