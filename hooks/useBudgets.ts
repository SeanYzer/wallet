import { useState, useEffect } from "react";
import { Budget } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getBudgets, saveBudget, deleteBudgetLocal, updateBudgetLocal } from "../utils/db";
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
      if (USE_API) {
        const response = await authFetch(`/api/budgets?userId=${activeUserId}`);
        if (!response.ok) return;
        const data = await response.json();
        setBudgets(data);
      } else {
        const data = await getBudgets();
        setBudgets(data);
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

      if (USE_API) {
        const response = await authFetch(`/api/budgets`, {
          method: "POST",
          body: JSON.stringify(newBudget),
        });
        if (!response.ok) throw new Error(`Failed to add budget: ${response.status}`);
        const saved = await response.json();
        setBudgets((prev) => [...prev, saved]);
      } else {
        await saveBudget(newBudget);
        setBudgets((prev) => [...prev, newBudget]);
      }
    } catch (error) {
      console.error("Error adding budget:", error);
      throw error;
    }
  };

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
      if (USE_API) {
        const response = await authFetch(`/api/budgets/${id}`, {
          method: "PUT",
          body: JSON.stringify({ ...updates, userId: activeUserId }),
        });
        const updatedData = await response.json();
        // Since backend might just return status: success without the item, we update optimistically
        setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
      } else {
        await updateBudgetLocal(id, updates);
        setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
      }
    } catch (error) {
      console.error("Error updating budget:", error);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      if (USE_API) {
        await authFetch(`/api/budgets/${id}`, { method: "DELETE" });
      } else {
        await deleteBudgetLocal(id);
      }
      setBudgets((prev) => prev.filter((b) => b.id !== id));
    } catch (error) {
      console.error("Error deleting budget:", error);
    }
  };

  return { budgets, loading, refetch: fetchBudgets, addBudget, updateBudget, deleteBudget };
}
