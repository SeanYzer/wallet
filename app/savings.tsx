import { useState, useCallback } from "react";
import { View, ScrollView, Alert } from "react-native";
import { Appbar, Text, FAB, Portal, Modal, TextInput, Button, Card, IconButton, useTheme, ProgressBar } from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";
import { useSavings } from "../hooks/useSavings";
import { useCurrency } from "../context/CurrencyContext";
import { PiggyBank } from "../components/PiggyBank";
import { useTransactions } from "../hooks/useTransactions";
import { useCategories } from "../context/CategoriesContext";

export default function SavingsScreen() {
    const router = useRouter();
    const theme = useTheme();
    const { goals, loading, addGoal, updateGoal, deleteGoal, refetch } = useSavings();
    const { formatAmount } = useCurrency();
    const { addTransaction } = useTransactions();
    const { categories, addCategory } = useCategories();

    const [modalVisible, setModalVisible] = useState(false);
    const [addAmountModalVisible, setAddAmountModalVisible] = useState(false);
    const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

    const [title, setTitle] = useState("");
    const [targetAmount, setTargetAmount] = useState("");
    const [depositAmount, setDepositAmount] = useState("");

    useFocusEffect(
        useCallback(() => {
            refetch();
        }, [])
    );

    const handleAddGoal = async () => {
        const numTarget = parseFloat(targetAmount);
        if (!title || isNaN(numTarget) || numTarget <= 0) {
            Alert.alert("Invalid Input", "Please provide a title and target amount.");
            return;
        }

        try {
            await addGoal({
                title,
                targetAmount: numTarget,
                currentAmount: 0,
                color: "#ff4081",
            });
            setModalVisible(false);
            setTitle("");
            setTargetAmount("");
        } catch (error) {
            Alert.alert("Error", "Failed to add goal.");
        }
    };

    const handleDeposit = async () => {
        const numDeposit = parseFloat(depositAmount);
        if (isNaN(numDeposit) || numDeposit <= 0 || !selectedGoalId) {
            Alert.alert("Invalid Input", "Please enter a valid amount.");
            return;
        }

        const goal = goals.find(g => g.id === selectedGoalId);
        if (goal) {
            try {
                // 1. Update Goal Amount
                await updateGoal(selectedGoalId, {
                    currentAmount: goal.currentAmount + numDeposit,
                });

                // 2. Create Transaction Link
                let savingsCat = categories.find(c => c.name === "Savings" && c.type === "expense");
                if (!savingsCat) {
                    // Use a fallback or wait for category creation (simplified for now)
                    savingsCat = categories.find(c => c.id === "8") || categories[0];
                }

                await addTransaction({
                    title: `Savings: ${goal.title}`,
                    amount: numDeposit,
                    type: "expense",
                    date: new Date().toISOString(),
                    category: savingsCat,
                    savingsGoalId: goal.id
                });

                setAddAmountModalVisible(false);
                setDepositAmount("");
                setSelectedGoalId(null);
            } catch (error) {
                console.error("Failed to update savings or create transaction:", error);
                Alert.alert("Error", "Failed to update savings.");
            }
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
            <Appbar.Header>
                <Appbar.BackAction onPress={() => router.back()} />
                <Appbar.Content title="Savings Goals" />
            </Appbar.Header>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {goals.length === 0 ? (
                    <Card style={{ padding: 20 }}>
                        <Text style={{ textAlign: "center", color: "gray" }}>
                            No savings goals yet. Start saving for that new phone or vacation!
                        </Text>
                    </Card>
                ) : (
                    goals.map((goal) => {
                        const progress = Math.min(goal.currentAmount / goal.targetAmount, 1);
                        return (
                            <Card key={goal.id} style={{ marginBottom: 16, borderRadius: 16, overflow: "hidden" }}>
                                <Card.Content>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                        <View style={{ flex: 1, marginRight: 16 }}>
                                            <Text variant="headlineSmall" style={{ fontWeight: "bold", marginBottom: 4 }}>{goal.title}</Text>
                                            <Text variant="titleMedium" style={{ color: theme.colors.primary }}>
                                                {formatAmount(goal.currentAmount)} / {formatAmount(goal.targetAmount)}
                                            </Text>

                                            <View style={{ marginTop: 16 }}>
                                                <ProgressBar progress={progress} color={theme.colors.primary} style={{ height: 10, borderRadius: 5 }} />
                                                <Text variant="labelSmall" style={{ marginTop: 4, textAlign: "right", color: "gray" }}>
                                                    {(progress * 100).toFixed(0)}% reached
                                                </Text>
                                            </View>

                                            <View style={{ flexDirection: "row", marginTop: 16, gap: 8 }}>
                                                <Button mode="contained" onPress={() => {
                                                    setSelectedGoalId(goal.id);
                                                    setAddAmountModalVisible(true);
                                                }}>
                                                    Add Savings
                                                </Button>
                                                <IconButton icon="delete" onPress={() => deleteGoal(goal.id)} />
                                            </View>
                                        </View>

                                        <View style={{ width: 120, height: 120, alignItems: "center", justifyContent: "center" }}>
                                            <PiggyBank progress={progress} size={100} />
                                        </View>
                                    </View>
                                </Card.Content>
                            </Card>
                        );
                    })
                )}
            </ScrollView>

            <Portal>
                {/* Add Goal Modal */}
                <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={{ backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 }}>
                    <Text variant="titleLarge" style={{ marginBottom: 16 }}>Set New Goal</Text>
                    <TextInput label="Goal Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 12 }} placeholder="e.g. New Phone" />
                    <TextInput label="Target Amount" value={targetAmount} onChangeText={setTargetAmount} keyboardType="numeric" mode="outlined" style={{ marginBottom: 16 }} left={<TextInput.Affix text="₱" />} />
                    <Button mode="contained" onPress={handleAddGoal}>Create Goal</Button>
                </Modal>

                {/* Deposit Modal */}
                <Modal visible={addAmountModalVisible} onDismiss={() => setAddAmountModalVisible(false)} contentContainerStyle={{ backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 }}>
                    <Text variant="titleLarge" style={{ marginBottom: 16 }}>Add Savings</Text>
                    <TextInput label="Amount to Add" value={depositAmount} onChangeText={setDepositAmount} keyboardType="numeric" mode="outlined" style={{ marginBottom: 16 }} left={<TextInput.Affix text="₱" />} />
                    <Button mode="contained" onPress={handleDeposit}>Confirm Deposit</Button>
                </Modal>
            </Portal>

            <FAB
                icon="piggy-bank"
                label="New Goal"
                style={{ position: "absolute", margin: 16, right: 0, bottom: 0 }}
                onPress={() => setModalVisible(true)}
            />
        </View>
    );
}
