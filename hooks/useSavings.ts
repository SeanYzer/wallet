import { useState, useEffect } from "react";
import { SavingsGoal } from "../types";
import { useAuth } from "../context/AuthContext";
import { API_URL, getSavingsGoals, saveSavingsGoal, saveSavingsGoalsBulk, deleteSavingsGoalLocal, updateSavingsGoalLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { generateUUID } from "../utils/uuid";

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
            if (API_URL && activeUserId) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    const response = await authFetch(`savingsGoals?userId=${activeUserId}`);
                    if (response.ok) {
                        const remoteData: SavingsGoal[] = await response.json();
                        if (Array.isArray(remoteData)) {
                            // Logical merge by title and ID
                            const localMap = new Map(localData.map(g => [g.id, g]));
                            const remoteMap = new Map(remoteData.map(g => [g.id, g]));
                            const remoteTitleMap = new Map(remoteData.map(g => [g.title.toLowerCase(), g]));

                            const mergedMap = new Map<string, SavingsGoal>();

                            // 1. Remote is authoritative
                            for (const remoteGoal of remoteData) {
                                mergedMap.set(remoteGoal.id, remoteGoal);
                            }

                            // 2. Add local-only goals that don't logically exist on remote
                            for (const localGoal of localData) {
                                if (remoteMap.has(localGoal.id)) continue;
                                if (remoteTitleMap.has(localGoal.title.toLowerCase())) continue;

                                mergedMap.set(localGoal.id, localGoal);

                                // Push missing local goal
                                authFetch(`savingsGoals`, {
                                    method: "POST",
                                    body: JSON.stringify(localGoal),
                                }).catch(err => console.error("Sync missing goal:", err));
                            }

                            const mergedGoals = Array.from(mergedMap.values());
                            await saveSavingsGoalsBulk(mergedGoals);
                            setGoals(mergedGoals);
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
            // Check for existing goal with the same title
            const existing = goals.find(g => g.title.toLowerCase() === goal.title.toLowerCase());
            if (existing) {
                await updateGoal(existing.id, goal);
                return;
            }

            const newGoal = { ...goal, id: generateUUID(), userId: activeUserId } as any;

            // 1. Save locally first
            await saveSavingsGoal(newGoal);
            setGoals((prev) => [...prev, newGoal]);

            // 2. Background sync to API
            if (API_URL) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`savingsGoals`, {
                        method: "POST",
                        body: JSON.stringify({
                            id: newGoal.id,
                            title: newGoal.title,
                            targetAmount: newGoal.targetAmount,
                            currentAmount: newGoal.currentAmount ?? 0,
                            color: newGoal.color ?? null,
                            icon: newGoal.icon ?? null,
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
            if (API_URL) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`savingsGoals/${id}`, {
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
            if (API_URL) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`savingsGoals/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error deleting savings goal:", error);
        }
    };

    return { goals, loading, refetch: fetchGoals, addGoal, updateGoal, deleteGoal };
}
