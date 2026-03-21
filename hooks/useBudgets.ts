import { useState, useEffect } from "react";
import { Platform } from "react-native";
import { Budget } from "../types";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

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
      const response = await fetch(`${API_URL}/budgets`);
      if (!response.ok) return;
      const data = await response.json();
      setBudgets(data);
    } catch (error) {
      console.error("Error fetching budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  const addBudget = async (budget: Omit<Budget, "id">) => {
    try {
      const response = await fetch(`${API_URL}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...budget, id: Date.now().toString() }),
      });
      if (!response.ok) throw new Error(`Failed to add budget: ${response.status}`);
      const newBudget = await response.json();
      setBudgets((prev) => [...prev, newBudget]);
    } catch (error) {
      console.error("Error adding budget:", error);
      throw error;
    }
  };

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
      const response = await fetch(`${API_URL}/budgets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const updatedBudget = await response.json();
      setBudgets((prev) => prev.map((b) => (b.id === id ? updatedBudget : b)));
    } catch (error) {
      console.error("Error updating budget:", error);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      await fetch(`${API_URL}/budgets/${id}`, { method: "DELETE" });
      setBudgets((prev) => prev.filter((b) => b.id !== id));
    } catch (error) {
      console.error("Error deleting budget:", error);
    }
  };

  return { budgets, loading, refetch: fetchBudgets, addBudget, updateBudget, deleteBudget };
}
