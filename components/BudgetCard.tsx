import { View } from "react-native";
import { Card, Text, ProgressBar, useTheme } from "react-native-paper";
import { Budget, Transaction } from "../types";
import { useCurrency } from "../context/CurrencyContext";

interface BudgetCardProps {
  budget: Budget;
  transactions: Transaction[];
  categoryName?: string;
}

export function BudgetCard({ budget, transactions, categoryName }: BudgetCardProps) {
  const theme = useTheme();
  const { formatAmount } = useCurrency();

  // Calculate spent amount — match by explicit budgetId link or category+month fallback
  const spent = transactions
    .filter((t) =>
      t.type === "expense" && (
        t.budgetId === budget.id ||
        (!t.budgetId && t.category.id.toString() === budget.categoryId?.toString())
      )
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const percentage = Math.min(spent / budget.amount, 1);
  const isOverBudget = spent > budget.amount;
  const isHighBudget = percentage > 0.8;
  const remaining = budget.amount - spent;

  const progressColor = isOverBudget
    ? "#ff4081" // Red for Overbudget
    : isHighBudget
      ? "#ff9800" // Orange for high budget (near limit)
      : "#4caf50"; // Green for safe

  return (
    <Card style={{ margin: 8, borderRadius: 16, elevation: 4 }}>
      <Card.Content>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View>
            <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
              {budget.name}
            </Text>
            <Text variant="labelSmall" style={{ color: "gray" }}>{budget.month}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="bodyLarge" style={{ fontWeight: "600", color: isOverBudget ? "#f44336" : theme.colors.onSurface }}>
              {formatAmount(spent)}
            </Text>
            <Text variant="labelSmall" style={{ color: "gray" }}>
              of {formatAmount(budget.amount)}
            </Text>
          </View>
        </View>

        <ProgressBar
          progress={percentage}
          color={progressColor}
          style={{ height: 12, borderRadius: 6, backgroundColor: "#e0e0e0" }}
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
          <Text variant="labelMedium" style={{ color: isHighBudget ? (isOverBudget ? "#f44336" : "#ff9800") : "gray" }}>
            {(percentage * 100).toFixed(0)}% used
          </Text>
          <Text variant="labelMedium" style={{ fontWeight: "bold", color: isOverBudget ? "#f44336" : "#4caf50" }}>
            {isOverBudget ? `Over by ${formatAmount(Math.abs(remaining))}` : `${formatAmount(remaining)} left`}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}
