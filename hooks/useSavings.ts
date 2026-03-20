import { useState, useEffect } from "react";
import { SavingsGoal } from "../types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export function useSavings() {
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchGoals();
    }, []);

    const fetchGoals = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/savingsGoals`);
            const data = await response.json();
            setGoals(data);
        } catch (error) {
            console.error("Error fetching savings goals:", error);
        } finally {
            setLoading(false);
        }
    };

    const addGoal = async (goal: Omit<SavingsGoal, "id">) => {
        try {
            const response = await fetch(`${API_URL}/savingsGoals`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...goal, id: Date.now().toString() }),
            });
            const newGoal = await response.json();
            setGoals((prev) => [...prev, newGoal]);
        } catch (error) {
            console.error("Error adding savings goal:", error);
            throw error;
        }
    };

    const updateGoal = async (id: string, updates: Partial<SavingsGoal>) => {
        try {
            const response = await fetch(`${API_URL}/savingsGoals/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const updatedGoal = await response.json();
            setGoals((prev) => prev.map((g) => (g.id === id ? updatedGoal : g)));
        } catch (error) {
            console.error("Error updating savings goal:", error);
        }
    };

    const deleteGoal = async (id: string) => {
        try {
            await fetch(`${API_URL}/savingsGoals/${id}`, { method: "DELETE" });
            setGoals((prev) => prev.filter((g) => g.id !== id));
        } catch (error) {
            console.error("Error deleting savings goal:", error);
        }
    };

    return { goals, loading, refetch: fetchGoals, addGoal, updateGoal, deleteGoal };
}
