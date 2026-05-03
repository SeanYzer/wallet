import { View, Platform } from "react-native";
import { Card, Text, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useCurrency } from "../context/CurrencyContext";
import { useUserProfile } from "../context/UserProfileContext";

export function SummaryCard({ transactions = [], budgets = [], goals = [] }: any) {
  const theme = useTheme();
  const { formatAmount } = useCurrency();
  const { profile } = useUserProfile();

  const initialBalance = Number(profile?.initialBalance || 0);

  const income = transactions
    .filter((t: any) => t.type === "income" && t.title !== "Opening Balance")
    .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

  const expense = transactions
    .filter((t: any) => t.type === "expense")
    .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

  const balance = initialBalance + income - expense;

  const currentMonth = new Date().toISOString().slice(0, 7);
  
  const reservedSavings = goals.reduce((sum: number, g: any) => sum + Number(g.currentAmount || 0), 0);
  
  const reservedBudgets = budgets
    .filter((b: any) => b.month === currentMonth)
    .reduce((sum: number, b: any) => {
      const spent = transactions
        .filter((t: any) => t.type === "expense" && (t.budgetId === b.id || (t.category?.id?.toString() === b.categoryId?.toString() && t.date?.slice(0, 7) === b.month)))
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      return sum + Math.max(0, Number(b.amount || 0) - spent);
    }, 0);

  const totalReserved = Number(reservedSavings || 0) + Number(reservedBudgets || 0);
  const availableBalance = balance - totalReserved;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
      <LinearGradient
        colors={[theme.colors.primary, "#0A2145"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 24,
          padding: 24,
          elevation: 8,
          ...Platform.select({
            web: { boxShadow: `0px 4px 12px ${theme.colors.primary}4D` },
            default: {
              shadowColor: theme.colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
            }
          })
        }}
      >
        <Text variant="labelMedium" style={{ color: "#fff", opacity: 0.7, textAlign: "center", letterSpacing: 1, fontWeight: "600" }}>
          AVAILABLE TO SPEND
        </Text>
        <Text variant="displayMedium" style={{ color: "#fff", fontWeight: "800", textAlign: "center", marginVertical: 8 }}>
          {formatAmount(availableBalance)}
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}>
          <View style={{ backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
            <Text variant="labelSmall" style={{ color: "#fff", opacity: 0.8 }}>Total: {formatAmount(balance)}</Text>
          </View>
          <View style={{ backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
            <Text variant="labelSmall" style={{ color: "#fff", opacity: 0.8 }}>Reserved: {formatAmount(totalReserved)}</Text>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 16 }} />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(39, 174, 96, 0.2)", justifyContent: "center", alignItems: "center", marginRight: 8 }}>
              <MaterialCommunityIcons name="arrow-down" size={18} color="#27AE60" />
            </View>
            <View>
              <Text variant="labelSmall" style={{ color: "#fff", opacity: 0.6 }}>Income</Text>
              <Text variant="titleMedium" style={{ color: "#fff", fontWeight: "700" }}>{formatAmount(income)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(229, 57, 53, 0.2)", justifyContent: "center", alignItems: "center", marginRight: 8 }}>
              <MaterialCommunityIcons name="arrow-up" size={18} color="#E53935" />
            </View>
            <View>
              <Text variant="labelSmall" style={{ color: "#fff", opacity: 0.6, textAlign: "right" }}>Expense</Text>
              <Text variant="titleMedium" style={{ color: "#fff", fontWeight: "700", textAlign: "right" }}>{formatAmount(expense)}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
