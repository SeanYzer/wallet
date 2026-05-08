import { View, ScrollView } from "react-native";
import { Modal, Portal, Text, Button, Divider, useTheme } from "react-native-paper";
import { useCurrency } from "../context/CurrencyContext";

interface BalanceBreakdownProps {
  visible: boolean;
  onDismiss: () => void;
  initialBalance: number;
  income: number;
  expense: number;
  budgets: any[];
  goals: any[];
  transactions: any[];
}

export function BalanceBreakdown({
  visible,
  onDismiss,
  initialBalance,
  income,
  expense,
  budgets,
  goals,
  transactions,
}: BalanceBreakdownProps) {
  const theme = useTheme();
  const { formatAmount } = useCurrency();

  const balance = initialBalance + income - expense;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const reservedSavings = goals.reduce((sum: number, g: any) => sum + Number(g.currentAmount || 0), 0);

  const budgetDetails = budgets
    .filter((b: any) => b.month === currentMonth)
    .map((b: any) => {
      const spent = transactions
        .filter((t: any) =>
          t.type === "expense" && (
            t.budgetId === b.id ||
            (!t.budgetId && t.category?.id?.toString() === b.categoryId?.toString() && t.date?.slice(0, 7) === b.month)
          )
        )
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      return { name: b.name, amount: b.amount, spent };
    });

  const reservedBudgets = budgetDetails.reduce(
    (sum: number, b: any) => sum + Math.max(0, Number(b.amount || 0) - b.spent),
    0
  );

  const totalReserved = reservedSavings + reservedBudgets;
  const availableBalance = balance - totalReserved;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={{
        backgroundColor: theme.colors.surface,
        margin: 20,
        borderRadius: 16,
        maxHeight: "80%",
      }}>
        <ScrollView style={{ padding: 24 }}>
          <Text variant="titleLarge" style={{ fontWeight: "700", marginBottom: 20, textAlign: "center" }}>
            Balance Breakdown
          </Text>

          <Text variant="labelMedium" style={{ color: theme.colors.outline, marginBottom: 4 }}>
            TOTAL BALANCE
          </Text>
          <Text variant="headlineSmall" style={{ fontWeight: "700", marginBottom: 12 }}>
            {formatAmount(balance)}
          </Text>

          <View style={{ paddingLeft: 12, marginBottom: 12 }}>
            <Row label="Initial Balance" value={initialBalance} format={formatAmount} />
            <Row label="+ Income" value={income} format={formatAmount} positive />
            <Row label="- Expenses" value={expense} format={formatAmount} negative />
          </View>

          <Divider style={{ marginVertical: 12 }} />

          <Text variant="labelMedium" style={{ color: theme.colors.outline, marginBottom: 4 }}>
            RESERVED
          </Text>
          <Text variant="headlineSmall" style={{ fontWeight: "700", marginBottom: 12 }}>
            {formatAmount(totalReserved)}
          </Text>

          <View style={{ paddingLeft: 12, marginBottom: 4 }}>
            <Text variant="labelLarge" style={{ fontWeight: "600", marginBottom: 4 }}>
              Budgets ({formatAmount(reservedBudgets)})
            </Text>
            {budgetDetails.length === 0 && (
              <Text variant="bodySmall" style={{ color: "gray", marginBottom: 8 }}>None</Text>
            )}
            {budgetDetails.map((b: any, i: number) => (
              <Text key={i} variant="bodySmall" style={{ color: "gray", marginBottom: 2 }}>
                {b.name}: {formatAmount(Math.max(0, b.amount - b.spent))} ({formatAmount(b.spent)} spent of {formatAmount(b.amount)})
              </Text>
            ))}

            <Text variant="labelLarge" style={{ fontWeight: "600", marginTop: 8, marginBottom: 4 }}>
              Savings ({formatAmount(reservedSavings)})
            </Text>
            {goals.length === 0 && (
              <Text variant="bodySmall" style={{ color: "gray", marginBottom: 8 }}>None</Text>
            )}
            {goals.map((g: any) => (
              <Text key={g.id} variant="bodySmall" style={{ color: "gray", marginBottom: 2 }}>
                {g.title}: {formatAmount(g.currentAmount)} of {formatAmount(g.targetAmount)}
              </Text>
            ))}
          </View>

          <Divider style={{ marginVertical: 12 }} />

          <Text variant="labelMedium" style={{ color: theme.colors.outline, marginBottom: 4 }}>
            AVAILABLE TO SPEND
          </Text>
          <Text variant="headlineSmall" style={{ fontWeight: "800", marginBottom: 20, color: theme.colors.primary }}>
            {formatAmount(availableBalance)}
          </Text>

          <Text variant="bodySmall" style={{ color: "gray", marginBottom: 16, lineHeight: 18 }}>
            Budgets reserve their unspent amounts. Savings goals reserve their accumulated amount.
            Linking a budget to an agenda does not deduct until the agenda is recorded as a transaction.
          </Text>

          <Button mode="contained" onPress={onDismiss}>
            Got It
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

function Row({ label, value, format, positive, negative }: {
  label: string;
  value: number;
  format: (v: number) => string;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive ? "#27AE60" : negative ? "#E53935" : undefined;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
      <Text variant="bodyMedium" style={{ color: "gray" }}>{label}</Text>
      <Text variant="bodyMedium" style={{ fontWeight: "600", color }}>{format(value)}</Text>
    </View>
  );
}
