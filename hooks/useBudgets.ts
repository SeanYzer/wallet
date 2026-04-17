import { useState, useEffect } from "react";
import { Budget } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getBudgets, saveBudget, saveBudgetsBulk, deleteBudgetLocal, updateBudgetLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";

export function useBudgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);

  const { activeUserId } = useAuth();

  useEffect(() => {
    if (!activeUserId) return;
    fetchBudgets();
  }, [activeUserId]);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      // 1. Always load from local first (source of truth)
      const localData = await getBudgets();
      setBudgets(localData);

      // 2. Background sync from API if enabled
      if (USE_API && activeUserId) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          const response = await authFetch(`/api/budgets`);
          if (response.ok) {
            const remoteData = await response.json();
            if (Array.isArray(remoteData) && remoteData.length > 0) {
              await saveBudgetsBulk(remoteData);
              const merged = await getBudgets();
              setBudgets(merged);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  const addBudget = async (budget: Omit<Budget, "id">) => {
    try {
      const newBudget = { ...budget, id: Date.now().toString(), userId: activeUserId } as Budget;

      // 1. Save locally first
      await saveBudget(newBudget);
      setBudgets((prev) => [...prev, newBudget]);

      // 2. Background sync to API
      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/budgets`, {
            method: "POST",
            body: JSON.stringify({
              amount: newBudget.amount,
              month: newBudget.month,
              categoryId: newBudget.categoryId ?? null,
              userId: activeUserId,
            }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error adding budget:", error);
      throw error;
    }
  };

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
      // 1. Update locally first
      await updateBudgetLocal(id, updates);
      setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));

      // 2. Background sync to API
      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/budgets/${id}`, {
            method: "PUT",
            body: JSON.stringify({ ...updates, userId: activeUserId }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error updating budget:", error);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      // 1. Delete locally first
      await deleteBudgetLocal(id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));

      // 2. Background sync to API
      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/budgets/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error deleting budget:", error);
    }
  };

  return { budgets, loading, refetch: fetchBudgets, addBudget, updateBudget, deleteBudget };
}
