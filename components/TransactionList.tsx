import { View, TouchableOpacity, Platform } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import { Transaction } from "../types";
import { useCurrency } from "../context/CurrencyContext";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

const PAYMENT_ICONS: Record<string, any> = {
  cash: "cash",
  card: "credit-card",
  bank_transfer: "bank",
  e_wallet: "wallet",
};

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const theme = useTheme();
  const router = useRouter();
  const { formatAmount } = useCurrency();

  const recentTransactions = [...transactions].reverse().slice(0, 10);

  return (
    <View style={{ marginHorizontal: 16, marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingHorizontal: 4 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700", color: theme.colors.onBackground }}>Recent Activity</Text>
        <TouchableOpacity onPress={() => router.push("/reports")}>
          <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: "600" }}>See All</Text>
        </TouchableOpacity>
      </View>

      {recentTransactions.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => router.push(`/transaction-details?id=${item.id}`)}
          activeOpacity={0.7}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            ...Platform.select({
              web: { boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)' },
              default: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 1
              }
            })
          }}
        >
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceVariant,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 16
          }}>
            <MaterialCommunityIcons
              name={PAYMENT_ICONS[item.paymentMethod || "cash"]}
              size={24}
              color={theme.colors.primary}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text variant="bodyLarge" style={{ fontWeight: "600", color: theme.colors.onSurface }}>
              {item.category?.name || "Unknown"}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
              {item.establishment || (item.note?.replace(/\s*\[Split Bill\].*$/s, "").trim()) || "No details"}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text
              variant="titleMedium"
              style={{
                fontWeight: "700",
                color: item.type === "income" ? "#27AE60" : theme.colors.error,
              }}
            >
              {item.type === "income" ? "+" : "-"}{formatAmount(item.amount)}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
              {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {recentTransactions.length === 0 && (
        <View style={{ padding: 40, alignItems: "center" }}>
          <MaterialCommunityIcons name="receipt" size={48} color={theme.colors.outline} style={{ opacity: 0.3 }} />
          <Text style={{ marginTop: 12, color: theme.colors.outline }}>No transactions yet.</Text>
        </View>
      )}
    </View>
  );
}
