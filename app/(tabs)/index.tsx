import { View, ActivityIndicator, ScrollView, TouchableOpacity, Platform } from "react-native";
import { FAB, Appbar, Text, Button, Card, IconButton } from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useRouter, useFocusEffect, Redirect } from "expo-router";
import { useCallback } from "react";
import { useAppTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useTransactions } from "../../hooks/useTransactions";
import { useSavings } from "../../hooks/useSavings";
import { useDues } from "../../hooks/useDues";
import { useCurrency } from "../../context/CurrencyContext";
import { useUserProfile } from "../../context/UserProfileContext";
import { SummaryCard } from "../../components/SummaryCard";
import { TransactionList } from "../../components/TransactionList";
import { FinancialTip } from "../../components/FinancialTip";
import { DashboardSkeleton } from "../../components/SkeletonLoader";
import { CloudLinkBanner } from "../../components/CloudLinkBanner";
import { SmartInsights } from "../../components/SmartInsights";


export default function Dashboard() {
  const router = useRouter();
  const { profile, isLoading: profileLoading } = useUserProfile();
  const { transactions, loading: txLoading, refetch: refetchTx } = useTransactions();
  const { items: savingsItems, refetch: refetchSavings } = useSavings();
  const { dues, refetch: refetchDues } = useDues();
  const { formatAmount } = useCurrency();
  const { theme } = useAppTheme();
  const { activeUserId } = useAuth();

  const loading = txLoading;

  useFocusEffect(
    useCallback(() => {
      if (activeUserId) {
        refetchTx();
        refetchSavings();
        refetchDues();
      }
    }, [activeUserId, refetchTx, refetchSavings, refetchDues])
  );

  if (!activeUserId) return null; // Let AuthLoader handle redirection

  if (profileLoading || (loading && transactions.length === 0)) {
    return <DashboardSkeleton />;
  }

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
        <CloudLinkBanner />

        <View style={{ marginTop: 8 }}>
          <SummaryCard transactions={transactions} goals={savingsItems} />
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <SmartInsights />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 20 }}>
          {[
             { label: "Scheduled", icon: "calendar-check-outline", path: "/dues" },
             { label: "Allocations", icon: "piggy-bank-outline", path: "/savings" },
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
                ...Platform.select({
                  web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)' },
                  default: {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 2
                  }
                })
              }}>
                <MaterialCommunityIcons name={item.icon as any} size={26} color={theme.colors.primary} />
              </View>
              <Text variant="labelSmall" style={{ fontWeight: "600", color: theme.colors.onSurfaceVariant }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {(() => {
          const now = new Date();
          const weekFromNow = new Date(now);
          weekFromNow.setDate(now.getDate() + 7);
          const upcomingDues = dues.filter(d => {
            if (d.completed) return false;
            const dDate = new Date(d.date);
            return dDate >= now && dDate <= weekFromNow;
          }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          if (upcomingDues.length === 0) return null;

          const totalExpenses = upcomingDues.filter(d => d.type === "expense").reduce((s, d) => s + d.amount, 0);
          const totalIncome = upcomingDues.filter(d => d.type === "income").reduce((s, d) => s + d.amount, 0);

          return (
            <TouchableOpacity onPress={() => router.push("/dues")} style={{ marginTop: 16, paddingHorizontal: 20 }}>
              <Card style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 16 }}>
                <Card.Content>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <MaterialCommunityIcons name="calendar-clock" size={20} color={theme.colors.primary} />
                    <Text variant="titleSmall" style={{ fontWeight: "700", marginLeft: 8 }}>Next 7 Days</Text>
                  </View>
                  <Text variant="bodyMedium">
                    {upcomingDues.length} due{upcomingDues.length > 1 ? "s" : ""}: {formatAmount(totalExpenses)} in expenses
                    {totalIncome > 0 ? `, ${formatAmount(totalIncome)} in income` : ""}
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 4 }}>Tap to view all dues</Text>
                </Card.Content>
              </Card>
            </TouchableOpacity>
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
        label="Record"
        style={{ position: "absolute", margin: 20, right: 0, bottom: 20, borderRadius: 20, backgroundColor: theme.colors.primary }}
        color="#fff"
        onPress={() => router.push("/add-transaction")}
      />
    </View>
  );
}
