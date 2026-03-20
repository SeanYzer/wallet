import { useState, useCallback } from "react";
import { View, ScrollView } from "react-native";
import { Appbar, Text, FAB, Portal, Modal, TextInput, Button, Card, ProgressBar, useTheme, IconButton } from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";
import { useBudgets } from "../hooks/useBudgets";
import { useTransactions } from "../hooks/useTransactions";
import { useCurrency } from "../context/CurrencyContext";
import { useCategories } from "../context/CategoriesContext";
import { Transaction, Budget } from "../types";

export default function BudgetsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { budgets, addBudget, deleteBudget, refetch: refetchBudgets } = useBudgets();
  const { transactions, refetch: refetchTx } = useTransactions();
  const { formatAmount } = useCurrency();
  const { categories } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [budgetAmount, setBudgetAmount] = useState("");

  useFocusEffect(
    useCallback(() => {
      refetchBudgets();
      refetchTx();
    }, [])
  );

  const handleAddBudget = async () => {
    if (!selectedCategory || !budgetAmount) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    await addBudget({
      categoryId: selectedCategory.id,
      amount: parseFloat(budgetAmount),
      month: currentMonth,
    });

    setSelectedCategory(null);
    setBudgetAmount("");
    setModalVisible(false);
  };

  const getCategorySpending = (categoryId: string) => {
    return transactions
      .filter((t: Transaction) => t.type === "expense" && t.category.id.toString() === categoryId.toString())
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id.toString() === categoryId.toString())?.name || "Unknown Category";
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background, elevation: 0 }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Budgets" titleStyle={{ fontWeight: "700" }} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {budgets.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <Text style={{ textAlign: "center", color: "gray" }}>
              No budgets set. Tap + to create your first budget!
            </Text>
          </Card>
        ) : (
          budgets.map((budget: Budget) => {
            const spent = getCategorySpending(budget.categoryId.toString());
            const percentage = Math.min(spent / budget.amount, 1);
            const isOverBudget = spent > budget.amount;
            const remaining = budget.amount - spent;

            const progressColor = isOverBudget
              ? theme.colors.error
              : percentage > 0.8
                ? "#ff9800"
                : theme.colors.primary;

            return (
              <Card key={budget.id} style={{ marginBottom: 12, borderRadius: 12 }}>
                <Card.Content>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <View>
                      <Text variant="titleMedium">
                        {getCategoryName(budget.categoryId.toString())} ({budget.month})
                      </Text>
                      <Text variant="bodyMedium" style={{ color: isOverBudget ? theme.colors.error : "gray" }}>
                        {formatAmount(spent)} / {formatAmount(budget.amount)}
                      </Text>
                    </View>
                    <IconButton
                      icon="delete-outline"
                      iconColor={theme.colors.error}
                      size={20}
                      onPress={() => deleteBudget(budget.id)}
                    />
                  </View>

                  <ProgressBar
                    progress={percentage}
                    color={progressColor}
                    style={{ height: 12, borderRadius: 6 }}
                  />

                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                    <Text variant="labelSmall" style={{ color: "gray" }}>
                      {(percentage * 100).toFixed(0)}% used
                    </Text>
                    <Text variant="labelSmall" style={{ color: isOverBudget ? theme.colors.error : "green" }}>
                      {isOverBudget ? `Over by ${formatAmount(Math.abs(remaining))}` : `${formatAmount(remaining)} left`}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            );
          })
        )}
      </ScrollView>

      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={{ backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 }}>
          <Text variant="titleLarge" style={{ marginBottom: 16 }}>Set New Budget</Text>

          <Text variant="labelLarge" style={{ marginBottom: 8 }}>Select Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {categories.filter(c => c.type === "expense").map(cat => (
                <Button
                  key={cat.id}
                  mode={selectedCategory?.id === cat.id ? "contained" : "outlined"}
                  onPress={() => setSelectedCategory(cat)}
                  style={{ borderRadius: 20 }}
                >
                  {cat.name}
                </Button>
              ))}
            </View>
          </ScrollView>

          <TextInput
            label="Budget Amount"
            value={budgetAmount}
            onChangeText={(text) => setBudgetAmount(text.replace(/[^0-9.]/g, ""))}
            keyboardType="numeric"
            mode="outlined"
            left={<TextInput.Affix text="₱" />}
            style={{ marginBottom: 16 }}
          />

          <Button mode="contained" onPress={handleAddBudget} disabled={!selectedCategory || !budgetAmount}>
            Save Budget
          </Button>
        </Modal>
      </Portal>

      <FAB
        icon="plus"
        style={{ position: "absolute", margin: 16, right: 0, bottom: 0 }}
        onPress={() => setModalVisible(true)}
      />
    </View>
  );
}
