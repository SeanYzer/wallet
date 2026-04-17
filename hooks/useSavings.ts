import { useState, useEffect } from "react";
import { SavingsGoal } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getSavingsGoals, saveSavingsGoal, deleteSavingsGoalLocal, updateSavingsGoalLocal } from "../utils/db";
import { authFetch } from "../utils/apiClient";

export function useSavings() {
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [loading, setLoading] = useState(false);

    const { activeUserId } = useAuth();

    useEffect(() => {
        if (!activeUserId) return;
        fetchGoals();
    }, [activeUserId]);

    const fetchGoals = async () => {
        setLoading(true);
        try {
            if (USE_API) {
                const response = await authFetch(`/api/savingsGoals?userId=${activeUserId}`);
                if (!response.ok) return;
                const data = await response.json();
                setGoals(data);
            } else {
                const data = await getSavingsGoals();
                setGoals(data);
            }
        } catch (error) {
            console.error("Error fetching savings goals:", error);
        } finally {
            setLoading(false);
        }
    };

    const addGoal = async (goal: Omit<SavingsGoal, "id">) => {
        try {
            const newGoal = { ...goal, id: Date.now().toString(), userId: activeUserId } as any;

            if (USE_API) {
                const response = await authFetch(`/api/savingsGoals`, {
                    method: "POST",
                    body: JSON.stringify(newGoal),
                });
                if (!response.ok) throw new Error(`Failed to add goal: ${response.status}`);
                const saved = await response.json();
                setGoals((prev) => [...prev, saved]);
            } else {
                await saveSavingsGoal(newGoal);
                setGoals((prev) => [...prev, newGoal]);
            }
        } catch (error) {
            console.error("Error adding savings goal:", error);
            throw error;
        }
    };

    const updateGoal = async (id: string, updates: Partial<SavingsGoal>) => {
        try {
            if (USE_API) {
                const response = await authFetch(`/api/savingsGoals/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({ ...updates, userId: activeUserId }),
                });
                const updatedGoal = await response.json();
                setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
            } else {
                await updateSavingsGoalLocal(id, updates);
                setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
            }
        } catch (error) {
            console.error("Error updating savings goal:", error);
        }
    };

    const deleteGoal = async (id: string) => {
        try {
            if (USE_API) {
                await authFetch(`/api/savingsGoals/${id}`, { method: "DELETE" });
            } else {
                await deleteSavingsGoalLocal(id);
            }
            setGoals((prev) => prev.filter((g) => g.id !== id));
        } catch (error) {
            console.error("Error deleting savings goal:", error);
        }
    };

    return { goals, loading, refetch: fetchGoals, addGoal, updateGoal, deleteGoal };
}
