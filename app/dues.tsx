import { useState, useCallback, useMemo } from "react";
import { View, ScrollView, Alert } from "react-native";
import { Appbar, Text, Card, FAB, Portal, Modal, TextInput, Button, List, Checkbox, useTheme, Divider, Chip, IconButton, SegmentedButtons } from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCurrency } from "../context/CurrencyContext";
import { Platform } from "react-native";
import { useDues } from "../hooks/useDues";
import { useTransactions } from "../hooks/useTransactions";
import { useCategories } from "../context/CategoriesContext";
import { DueFrequency } from "../types";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

export default function DuesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { formatAmount } = useCurrency();
  const { dues, addDue, updateDue, deleteDue, refetch } = useDues();
  const { addTransaction } = useTransactions();
  const { categories } = useCategories();

  const [filter, setFilter] = useState<"week" | "month" | "all">("week");
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [frequency, setFrequency] = useState<DueFrequency>("once");
  const [autoProcess, setAutoProcess] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [])
  );

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const filteredDues = useMemo(() => {
    const upcoming = dues.filter((d) => !d.completed).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const completed = dues.filter((d) => d.completed);

    const filterByDate = (items: Due[]) => {
      if (filter === "week") {
        return items.filter((d) => {
          const dDate = new Date(d.date);
          return dDate >= startOfWeek && dDate <= endOfWeek;
        });
      }
      if (filter === "month") {
        return items.filter((d) => {
          const dDate = new Date(d.date);
          return dDate >= startOfMonth && dDate <= endOfMonth;
        });
      }
      return items;
    };

    return {
      upcoming: filterByDate(upcoming),
      completed: filterByDate(completed),
    };
  }, [dues, filter]);

  const weekTotal = useMemo(() => {
    return dues
      .filter((d) => !d.completed)
      .filter((d) => {
        const dDate = new Date(d.date);
        return dDate >= startOfWeek && dDate <= endOfWeek;
      })
      .reduce((sum, d) => {
        const amount = d.type === "expense" ? d.amount : -d.amount;
        return sum + amount;
      }, 0);
  }, [dues]);

  const monthTotal = useMemo(() => {
    return dues
      .filter((d) => !d.completed)
      .filter((d) => {
        const dDate = new Date(d.date);
        return dDate >= startOfMonth && dDate <= endOfMonth;
      })
      .reduce((sum, d) => {
        const amount = d.type === "expense" ? d.amount : -d.amount;
        return sum + amount;
      }, 0);
  }, [dues]);

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleAdd = async () => {
    if (!title) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    await addDue({
      title,
      amount: numAmount,
      date: date.toISOString(),
      type,
      frequency,
      autoProcess,
      categoryId: selectedCategoryId,
      completed: false,
    });
    setTitle("");
    setAmount("");
    setDate(new Date());
    setFrequency("once");
    setAutoProcess(false);
    setSelectedCategoryId(undefined);
    setModalVisible(false);
  };

  const recordTransaction = async (item: any) => {
    try {
      await addTransaction({
        title: item.title,
        amount: item.amount,
        type: item.type || "expense",
        date: new Date().toISOString(),
        category: categories.find(c => c.type === (item.type || "expense")) || { id: "8", name: "Others", type: "expense" },
      });
      await updateDue(item.id, { completed: true });

      if (item.frequency && item.frequency !== "once") {
        const nextDate = new Date(item.date);
        switch (item.frequency) {
          case "weekly": nextDate.setDate(nextDate.getDate() + 7); break;
          case "biweekly": nextDate.setDate(nextDate.getDate() + 14); break;
          case "monthly": nextDate.setMonth(nextDate.getMonth() + 1); break;
          case "yearly": nextDate.setFullYear(nextDate.getFullYear() + 1); break;
        }
        await addDue({
          title: item.title,
          amount: item.amount,
          date: nextDate.toISOString(),
          type: item.type,
          frequency: item.frequency,
          autoProcess: item.autoProcess,
          categoryId: item.categoryId,
          completed: false,
        });
      }

      Alert.alert("Recorded", "Transaction recorded successfully.");
    } catch (error) {
      console.error("Failed to record transaction:", error);
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    const item = dues.find((d) => d.id === id);
    const newStatus = !completed;

    if (newStatus && item?.amount) {
      Alert.alert(
        "Record Transaction?",
        `Record "${item.title}" (${formatAmount(item.amount)}) as a transaction?`,
        [
          { text: "Skip", onPress: () => updateDue(id, { completed: true }) },
          { text: "Record", onPress: () => recordTransaction(item) },
        ]
      );
    } else {
      await updateDue(id, { completed: newStatus });
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDue(id);
  };

  const getFrequencyLabel = (freq?: DueFrequency) => {
    switch (freq) {
      case "weekly": return "Weekly";
      case "biweekly": return "Biweekly";
      case "monthly": return "Monthly";
      case "yearly": return "Yearly";
      default: return "Once";
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Dues" />
      </Appbar.Header>

      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <SegmentedButtons
          value={filter}
          onValueChange={(val) => setFilter(val as any)}
          buttons={[
            { value: "week", label: "This Week" },
            { value: "month", label: "This Month" },
            { value: "all", label: "All" },
          ]}
        />
      </View>

      {filter !== "all" && (
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          <Card style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: theme.colors.errorContainer }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer, textAlign: "center" }}>
              {filter === "week" ? "Week" : "Month"} Total
            </Text>
            <Text variant="titleMedium" style={{ fontWeight: "700", textAlign: "center", color: (filter === "week" ? weekTotal : monthTotal) > 0 ? theme.colors.onErrorContainer : theme.colors.onErrorContainer }}>
              {formatAmount(Math.abs(filter === "week" ? weekTotal : monthTotal))}
            </Text>
          </Card>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {filteredDues.upcoming.length === 0 && filteredDues.completed.length === 0 ? (
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <Text style={{ color: "gray", textAlign: "center" }}>No dues in this period. Tap + to add one!</Text>
          </Card>
        ) : (
          <>
            {filteredDues.upcoming.length > 0 && (
              <>
                <Text variant="titleMedium" style={{ marginBottom: 8 }}>Upcoming</Text>
                <Card style={{ marginBottom: 16 }}>
                  <Card.Content>
                    {filteredDues.upcoming.map((item, index, arr) => {
                      const isToday = new Date(item.date).toDateString() === now.toDateString();
                      return (
                        <View key={item.id}>
                          <List.Item
                            title={item.title}
                            titleStyle={{ fontWeight: isToday ? "bold" : "normal" }}
                            description={`${new Date(item.date).toLocaleDateString()}  ${formatAmount(item.amount)}  ${getFrequencyLabel(item.frequency)}`}
                            left={() => (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Checkbox
                                  status={item.completed ? "checked" : "unchecked"}
                                  onPress={() => toggleComplete(item.id, item.completed || false)}
                                />
                                <IconButton
                                  icon={item.type === "income" ? "arrow-up-circle" : "arrow-down-circle"}
                                  iconColor={item.type === "income" ? "#2E7D32" : "#D32F2F"}
                                  size={20}
                                />
                              </View>
                            )}
                            right={() => (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                {isToday && <Text variant="labelSmall" style={{ color: theme.colors.primary, marginRight: 8, fontWeight: "bold" }}>DUE</Text>}
                                {item.autoProcess && <MaterialCommunityIcons name="lightning-bolt" size={16} color="#D97706" style={{ marginRight: 4 }} />}
                                <Button mode="outlined" compact onPress={() => recordTransaction(item)} style={{ marginRight: 8 }}>Pay</Button>
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
              </>
            )}

            {filteredDues.completed.length > 0 && (
              <>
                <Text variant="titleMedium" style={{ marginBottom: 8 }}>Completed</Text>
                <Card style={{ marginBottom: 16 }}>
                  <Card.Content>
                    {filteredDues.completed.map((item, index) => (
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
                        {index < filteredDues.completed.length - 1 && <Divider />}
                      </View>
                    ))}
                  </Card.Content>
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={{ backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 }}>
          <Text variant="titleLarge" style={{ marginBottom: 16 }}>New Due</Text>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Chip selected={type === "expense"} onPress={() => setType("expense")} icon="arrow-down-circle" selectedColor="#D32F2F">Expense</Chip>
            <Chip selected={type === "income"} onPress={() => setType("income")} icon="arrow-up-circle" selectedColor="#2E7D32">Income</Chip>
          </View>

          <Text style={{ marginBottom: 8, fontWeight: "600" }}>Frequency</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {(["once", "weekly", "biweekly", "monthly", "yearly"] as DueFrequency[]).map((f) => (
              <Chip key={f} selected={frequency === f} onPress={() => setFrequency(f)} mode="outlined" style={{ borderRadius: 16 }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Chip>
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text variant="bodyLarge">Auto-Process</Text>
            <Checkbox status={autoProcess ? "checked" : "unchecked"} onPress={() => setAutoProcess(!autoProcess)} />
          </View>

          <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 12 }} />
          <TextInput label="Amount" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" mode="outlined" style={{ marginBottom: 12 }} left={<TextInput.Affix text="₱" />} />

          <TextInput
            label="Date"
            value={date.toLocaleDateString()}
            mode="outlined"
            editable={false}
            right={<TextInput.Icon icon="calendar" onPress={() => setShowDatePicker(true)} />}
            style={{ marginBottom: 16 }}
          />

          {showDatePicker && (
            <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
          )}

          <Text style={{ marginBottom: 8, fontWeight: "600" }}>Category (Optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {categories.filter((c) => c.type === type).map((cat) => (
                <Chip
                  key={cat.id}
                  selected={selectedCategoryId === cat.id}
                  onPress={() => setSelectedCategoryId(selectedCategoryId === cat.id ? undefined : cat.id)}
                  mode="outlined"
                  style={{ borderRadius: 16 }}
                >
                  {cat.name}
                </Chip>
              ))}
            </View>
          </ScrollView>

          <Button mode="contained" onPress={handleAdd} disabled={!title || !amount}>Add Due</Button>
        </Modal>
      </Portal>

      <FAB icon="plus" style={{ position: "absolute", margin: 16, right: 0, bottom: 0 }} onPress={() => setModalVisible(true)} />
    </View>
  );
}
