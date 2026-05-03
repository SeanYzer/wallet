import { useState, useCallback } from "react";
import { View, ScrollView } from "react-native";
import { Appbar, Text, Card, FAB, Portal, Modal, TextInput, Button, List, Checkbox, useTheme, Divider, Chip, IconButton } from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCurrency } from "../context/CurrencyContext";
import { Alert, Platform } from "react-native";
import { useAgenda } from "../hooks/useAgenda";
import { useBudgets } from "../hooks/useBudgets";
import { useSavings } from "../hooks/useSavings";
import { useTransactions } from "../hooks/useTransactions";
import { useCategories } from "../context/CategoriesContext";

export default function AgendaScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { formatAmount } = useCurrency();
  const { agendas, addAgenda, updateAgenda, deleteAgenda, refetch } = useAgenda();
  const { budgets } = useBudgets();
  const { goals } = useSavings();
  const { addTransaction } = useTransactions();
  const { categories } = useCategories();
  const [type, setType] = useState<"expense" | "income">("expense");

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date());
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [selectedSavingsGoalId, setSelectedSavingsGoalId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false); // Close on selection for both platforms
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [])
  );

  const handleAdd = async () => {
    if (!title) return;
    const numAmount = amount ? parseFloat(amount) : undefined;
    if (amount && isNaN(numAmount as number)) {
      Alert.alert("Invalid Amount", "Please enter a valid number.");
      return;
    }

    await addAgenda({
      title,
      date: date.toISOString(),
      amount: numAmount,
      completed: false,
      budgetId: selectedBudgetId || undefined,
      savingsGoalId: selectedSavingsGoalId || undefined,
      type,
      isRecurring,
    });
    setTitle("");
    setAmount("");
    setDate(new Date());
    setSelectedBudgetId(null);
    setSelectedSavingsGoalId(null);
    setIsRecurring(false);
    setModalVisible(false);
  };

  const recordTransactionFromAgenda = async (item: any) => {
    if (!item.amount) {
      Alert.alert("Missing Amount", "Please add an amount to the reminder first.");
      return;
    }

    try {
      await addTransaction({
        title: item.title,
        amount: item.amount,
        type: item.type || "expense",
        date: new Date().toISOString(),
        category: categories.find(c => c.type === (item.type || "expense")) || { id: "8", name: "Others", type: "expense" },
        budgetId: item.budgetId,
        savingsGoalId: item.savingsGoalId,
      });
      Alert.alert("Success", "Transaction recorded successfully.");
      // Optionally mark as completed
      if (!item.completed) {
        await updateAgenda(item.id, { completed: true });
      }
    } catch (error) {
      console.error("Failed to record transaction:", error);
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    const item = agendas.find(a => a.id === id);
    const newStatus = !completed;
    
    await updateAgenda(id, { completed: newStatus });

    if (newStatus && item?.amount) {
      // Handle Recurrence spawning
      if (item.isRecurring) {
        const nextDate = new Date(item.date);
        nextDate.setMonth(nextDate.getMonth() + 1);
        
        await addAgenda({
          title: item.title,
          date: nextDate.toISOString(),
          amount: item.amount,
          completed: false,
          budgetId: item.budgetId,
          savingsGoalId: item.savingsGoalId,
          type: item.type,
          isRecurring: true,
        });
      }

      Alert.alert(
        "Record Transaction?",
        `Would you like to record "${item.title}" (${formatAmount(item.amount)}) as a transaction?`,
        [
          { text: "No", style: "cancel" },
          { text: "Yes, Record", onPress: () => recordTransactionFromAgenda(item) }
        ]
      );
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAgenda(id);
  };

  const upcoming = agendas.filter((a) => !a.completed).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completed = agendas.filter((a) => a.completed);

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Agenda & Reminders" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Upcoming</Text>
        {upcoming.length === 0 ? (
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <Text style={{ color: "gray", textAlign: "center" }}>No upcoming items. Tap + to add one!</Text>
          </Card>
        ) : (
          <Card style={{ marginBottom: 16 }}>
            <Card.Content>
              {Array.from(new Map(upcoming.map(item => [item.id, item])).values()).map((item, index, arr) => {
                const isToday = new Date(item.date).toDateString() === new Date().toDateString();
                const itemType = item.type || "expense";
                
                return (
                  <View key={item.id}>
                    <List.Item
                      title={item.title}
                      titleStyle={{ fontWeight: isToday ? "bold" : "normal" }}
                      description={`${new Date(item.date).toLocaleDateString()}${item.amount ? `  ${formatAmount(item.amount)}` : ""}`}
                      left={() => (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Checkbox
                            status={item.completed ? "checked" : "unchecked"}
                            onPress={() => toggleComplete(item.id, item.completed || false)}
                          />
                          <IconButton 
                            icon={itemType === "income" ? "arrow-up-circle" : "arrow-down-circle"} 
                            iconColor={itemType === "income" ? "#2E7D32" : "#D32F2F"} 
                            size={20}
                          />
                        </View>
                      )}
                      right={() => (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          {isToday && <Text variant="labelSmall" style={{ color: theme.colors.primary, marginRight: 8, fontWeight: 'bold' }}>DUE TODAY</Text>}
                          <Button mode="outlined" compact onPress={() => recordTransactionFromAgenda(item)} style={{ marginRight: 8 }}>Record</Button>
                          <IconButton icon="delete" onPress={() => handleDelete(item.id)} iconColor={theme.colors.error} />
                        </View>
                      )}
                    />
                    {index < arr.length - 1 && <Divider />}
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        )}

        {completed.length > 0 && (
          <>
            <Text variant="titleMedium" style={{ marginBottom: 8 }}>Completed</Text>
            <Card style={{ marginBottom: 16 }}>
              <Card.Content>
                {completed.map((item, index) => (
                  <View key={item.id}>
                    <List.Item
                      title={item.title}
                      titleStyle={{ textDecorationLine: "line-through", color: "gray" }}
                      description={new Date(item.date).toLocaleDateString()}
                      left={() => (
                        <Checkbox
                          status="checked"
                          onPress={() => toggleComplete(item.id, item.completed || false)}
                        />
                      )}
                    />
                    {index < completed.length - 1 && <Divider />}
                  </View>
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={{ backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 }}>
          <Text variant="titleLarge" style={{ marginBottom: 16 }}>New Reminder</Text>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Chip 
              selected={type === "expense"} 
              onPress={() => setType("expense")} 
              icon="arrow-down-circle"
              selectedColor="#D32F2F"
            >Expense</Chip>
            <Chip 
              selected={type === "income"} 
              onPress={() => setType("income")} 
              icon="arrow-up-circle"
              selectedColor="#2E7D32"
            >Income</Chip>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingRight: 8 }}>
            <Text variant="bodyLarge">Monthly Recurring</Text>
            <Checkbox
              status={isRecurring ? "checked" : "unchecked"}
              onPress={() => setIsRecurring(!isRecurring)}
            />
          </View>

          <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 12 }} />
          <TextInput 
            label="Amount (Optional)" 
            value={amount} 
            onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ""))} 
            keyboardType="numeric" 
            mode="outlined" 
            style={{ marginBottom: 12 }} 
          />
          <TextInput
            label="Date"
            value={date.toLocaleDateString()}
            mode="outlined"
            editable={false}
            right={<TextInput.Icon icon="calendar" onPress={() => setShowDatePicker(true)} />}
            style={{ marginBottom: 16 }}
          />

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={onDateChange}
            />
          )}

          <Text variant="labelMedium" style={{ marginTop: 12, marginBottom: 8 }}>Link to Budget or Savings Goal (Optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* Budgets for current month */}
              {budgets.filter(b => b.month === new Date().toISOString().slice(0, 7)).map(b => {
                const catName = categories.find(c => String(c.id) === String(b.categoryId))?.name || "Budget";
                return (
                  <Chip
                    key={b.id}
                    selected={selectedBudgetId === b.id}
                    onPress={() => {
                      setSelectedBudgetId(selectedBudgetId === b.id ? null : b.id);
                      setSelectedSavingsGoalId(null);
                    }}
                    mode="flat"
                    icon="chart-donut"
                    selectedColor={theme.colors.primary}
                    style={{ borderRadius: 16, backgroundColor: selectedBudgetId === b.id ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                  >
                    Budget: {catName}
                  </Chip>
                );
              })}
              {/* Savings Goals */}
              {goals.map(g => (
                <Chip
                  key={g.id}
                  selected={selectedSavingsGoalId === g.id}
                  onPress={() => {
                    setSelectedSavingsGoalId(selectedSavingsGoalId === g.id ? null : g.id);
                    setSelectedBudgetId(null);
                  }}
                  mode="flat"
                  icon="piggy-bank"
                  selectedColor="#2E7D32"
                  style={{ borderRadius: 16, backgroundColor: selectedSavingsGoalId === g.id ? "#C8E6C9" : theme.colors.surfaceVariant }}
                >
                  Goal: {g.title}
                </Chip>
              ))}
            </View>
          </ScrollView>

          <Button mode="contained" onPress={handleAdd} disabled={!title}>Add Reminder</Button>
        </Modal>
      </Portal>

      <FAB icon="plus" style={{ position: "absolute", margin: 16, right: 0, bottom: 0 }} onPress={() => setModalVisible(true)} />
    </View>
  );
}
