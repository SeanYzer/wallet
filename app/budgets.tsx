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
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [budgetName, setBudgetName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editAmount, setEditAmount] = useState("");

  useFocusEffect(
    useCallback(() => {
      refetchBudgets();
      refetchTx();
    }, [])
  );

  const handleAddBudget = async () => {
    if (!budgetName || !budgetAmount) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    await addBudget({
      name: budgetName,
      categoryId: selectedCategory?.id,
      amount: parseFloat(budgetAmount),
      month: currentMonth,
    });

    setBudgetName("");
    setSelectedCategory(null);
    setBudgetAmount("");
    setModalVisible(false);
  };

  const handleUpdateBudget = async () => {
    if (!editingBudget || !editAmount) return;

    await addBudget({
      ...editingBudget,
      amount: parseFloat(editAmount),
    });

    setEditingBudget(null);
    setEditAmount("");
    setEditModalVisible(false);
  };

  const getBudgetSpending = (budget: Budget) => {
    return transactions
      .filter((t: Transaction) => {
        if (t.type !== "expense") return false;
        
        // If the transaction is explicitly linked to a DIFFERENT budget, exclude it
        if (t.budgetId && t.budgetId !== budget.id) return false;
        
        // Match by explicit link to THIS budget
        if (t.budgetId === budget.id) return true;

        // Match by category and month (only if NOT explicitly linked elsewhere)
        const txMonth = t.date.slice(0, 7);
        return (
          t.category.id.toString() === budget.categoryId?.toString() && 
          txMonth === budget.month
        );
      })
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id.toString() === categoryId.toString())?.name || "Others";
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
            const spent = getBudgetSpending(budget);
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
                        {budget.name} ({budget.month})
                      </Text>
                      {budget.categoryId && (
                        <Text variant="labelSmall" style={{ color: "gray" }}>
                          {getCategoryName(budget.categoryId.toString())}
                        </Text>
                      )}
                      <Text variant="bodyMedium" style={{ color: isOverBudget ? theme.colors.error : "gray" }}>
                        {formatAmount(spent)} / {formatAmount(budget.amount)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row" }}>
                      <IconButton
                        icon="pencil-outline"
                        size={20}
                        onPress={() => {
                          setEditingBudget(budget);
                          setEditAmount(budget.amount.toString());
                          setEditModalVisible(true);
                        }}
                      />
                      <IconButton
                        icon="delete-outline"
                        iconColor={theme.colors.error}
                        size={20}
                        onPress={() => deleteBudget(budget.id)}
                      />
                    </View>
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

          <TextInput
            label="Budget Name"
            value={budgetName}
            onChangeText={setBudgetName}
            mode="outlined"
            style={{ marginBottom: 12 }}
            placeholder="e.g. Groceries, Rent, Fun Money"
          />

          <Text variant="labelLarge" style={{ marginBottom: 8 }}>Category (Optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {categories.filter(c => c.type === "expense").map(cat => (
                <Button
                  key={cat.id}
                  mode={selectedCategory?.id === cat.id ? "contained" : "outlined"}
                  onPress={() => setSelectedCategory(selectedCategory?.id === cat.id ? null : cat)}
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

          <Button mode="contained" onPress={handleAddBudget} disabled={!budgetName || !budgetAmount}>
            Save Budget
          </Button>
        </Modal>

        {/* Edit Budget Modal */}
        <Modal visible={editModalVisible} onDismiss={() => setEditModalVisible(false)} contentContainerStyle={{ backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 }}>
          <Text variant="titleLarge" style={{ marginBottom: 16 }}>Edit Budget</Text>
          <Text variant="labelLarge" style={{ marginBottom: 8 }}>
            {editingBudget?.name}
          </Text>
          {editingBudget?.categoryId && (
            <Text variant="labelSmall" style={{ color: "gray", marginBottom: 8 }}>
              {getCategoryName(editingBudget.categoryId.toString())}
            </Text>
          )}
          
          <TextInput
            label="Budget Amount"
            value={editAmount}
            onChangeText={(text) => setEditAmount(text.replace(/[^0-9.]/g, ""))}
            keyboardType="numeric"
            mode="outlined"
            left={<TextInput.Affix text="₱" />}
            style={{ marginBottom: 16 }}
          />

          <Button mode="contained" onPress={handleUpdateBudget} disabled={!editAmount}>
            Update Budget
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
