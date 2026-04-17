import { useState, useEffect } from "react";
import { SavingsGoal } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getSavingsGoals, saveSavingsGoal, saveSavingsGoalsBulk, deleteSavingsGoalLocal, updateSavingsGoalLocal, getSetting } from "../utils/db";
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
            // 1. Always load from local first (source of truth)
            const localData = await getSavingsGoals();
            setGoals(localData);

            // 2. Background sync from API if enabled
            if (USE_API && activeUserId) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    const response = await authFetch(`/api/savingsGoals?userId=${activeUserId}`);
                    if (response.ok) {
                        const remoteData = await response.json();
                        if (Array.isArray(remoteData) && remoteData.length > 0) {
                            await saveSavingsGoalsBulk(remoteData);
                            const merged = await getSavingsGoals();
                            setGoals(merged);
                        }
                    }
                }
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

            // 1. Save locally first
            await saveSavingsGoal(newGoal);
            setGoals((prev) => [...prev, newGoal]);

            // 2. Background sync to API
            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`/api/savingsGoals`, {
                        method: "POST",
                        body: JSON.stringify({
                            title: newGoal.title,
                            targetAmount: newGoal.targetAmount,
                            currentAmount: newGoal.currentAmount ?? 0,
                            color: newGoal.color ?? null,
                            userId: activeUserId,
                        }),
                    }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error adding savings goal:", error);
            throw error;
        }
    };

    const updateGoal = async (id: string, updates: Partial<SavingsGoal>) => {
        try {
            // 1. Update locally first
            await updateSavingsGoalLocal(id, updates);
            setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));

            // 2. Background sync to API
            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`/api/savingsGoals/${id}`, {
                        method: "PUT",
                        body: JSON.stringify({ ...updates, userId: activeUserId }),
                    }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error updating savings goal:", error);
        }
    };

    const deleteGoal = async (id: string) => {
        try {
            // 1. Delete locally first
            await deleteSavingsGoalLocal(id);
            setGoals((prev) => prev.filter((g) => g.id !== id));

            // 2. Background sync to API
            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`/api/savingsGoals/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error deleting savings goal:", error);
        }
    };

    return { goals, loading, refetch: fetchGoals, addGoal, updateGoal, deleteGoal };
}
