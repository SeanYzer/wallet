import { useState, useEffect } from "react";
import { Budget } from "../types";
import { useAuth } from "../context/AuthContext";
import { API_URL, getBudgets, saveBudget, saveBudgetsBulk, deleteBudgetLocal, updateBudgetLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { generateUUID } from "../utils/uuid";

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
      // 1. Load local first
      const localData = await getBudgets();
      setBudgets(localData);

      // 2. Skip API if unavailable / disabled
      if (!API_URL || !activeUserId) return;

      const autoBackup = await getSetting("autoBackup");
      if (autoBackup === "false") return;

      // 3. Fetch remote
      const response = await authFetch(`budgets`);
      if (!response.ok) return;

      const remoteData: Budget[] = await response.json();
      if (!Array.isArray(remoteData)) return;

      // 4. Build maps for comparison
      // We use a "logical key" (categoryId + month) to catch duplicates with different IDs
      const getLogicalKey = (b: Budget) => `${b.categoryId}_${b.month}`;
      
      const localMap = new Map(localData.map((b) => [b.id, b]));
      const remoteMap = new Map(remoteData.map((b) => [b.id, b]));
      const remoteLogicalMap = new Map(remoteData.map((b) => [getLogicalKey(b), b]));

      const mergedMap = new Map<string, Budget>();

      // 5. Merge logic: Remote is authoritative
      // First, take all remote budgets
      for (const remoteBudget of remoteData) {
          mergedMap.set(remoteBudget.id, remoteBudget);
      }

      // Then, check local budgets
      for (const localBudget of localData) {
          const logicalKey = getLogicalKey(localBudget);
          
          if (remoteMap.has(localBudget.id)) {
              // Same ID exists on remote - we already have it from the remote loop
              continue;
          }

          if (remoteLogicalMap.has(logicalKey)) {
              // Same category+month exists on remote but with a different ID
              // We should discard the local version and use the remote one to avoid duplicates
              continue;
          }

          // Exists only locally and no logical duplicate on remote -> keep it + push to API
          mergedMap.set(localBudget.id, localBudget);

          authFetch(`budgets`, {
            method: "POST",
            body: JSON.stringify(localBudget),
          }).then(response => {
            if (!response.ok) {
              console.error("Failed to push missing local budget:", response.status);
            }
          }).catch((err) => console.error("Push missing local budget network error:", err));
      }

      // 7. Final clean merged list
      const mergedBudgets = Array.from(mergedMap.values());

      // 8. Replace local with clean merged data
      await saveBudgetsBulk(mergedBudgets);

      // 9. Refresh state
      setBudgets(mergedBudgets);
    } catch (error) {
      console.error("Error fetching budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  // const fetchBudgets = async () => {
  //   setLoading(true);
  //   try {
  //     // 1. Always load from local first (source of truth)
  //     const localData = await getBudgets();
  //     setBudgets(localData);

  //     // 2. Background sync from API if enabled
  //     if (API_URL && activeUserId) {
  //       const autoBackup = await getSetting('autoBackup');
  //       if (autoBackup !== 'false') {
  //         const response = await authFetch(`budgets`);
  //         if (response.ok) {
  //           const remoteData = await response.json();
  //           if (Array.isArray(remoteData) && remoteData.length > 0) {
  //             await saveBudgetsBulk(remoteData);
  //             const merged = await getBudgets();
  //             setBudgets(merged);
  //           }
  //         }
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Error fetching budgets:", error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const addBudget = async (budget: Omit<Budget, "id">) => {
    try {
      // Check for existing budget for this category and month
      const existing = budgets.find(b => 
        String(b.categoryId) === String(budget.categoryId) && 
        b.month === budget.month
      );

      if (existing) {
        // If it exists, we update the existing one instead of adding a new one
        await updateBudget(existing.id, { amount: budget.amount });
        return;
      }

      const newBudget = { ...budget, id: generateUUID(), userId: activeUserId } as Budget;

      // 1. Save locally first
      await saveBudget(newBudget);
      setBudgets((prev) => [...prev, newBudget]);

      // 2. Background sync to API
      if (API_URL) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`budgets`, {
            method: "POST",
            body: JSON.stringify({
              id: newBudget.id,
              amount: newBudget.amount,
              month: newBudget.month,
              categoryId: newBudget.categoryId ?? null,
              userId: activeUserId,
            }),
          }).then(response => {
            if (!response.ok) {
              console.error("Failed to sync budget to server:", response.status);
            }
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
      if (API_URL) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`budgets/${id}`, {
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
      if (API_URL) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`budgets/${id}`, { method: "DELETE" }).then(response => {
            if (response.status === 404) {
              console.log("Budget not found on server, likely was never synced or already deleted");
            } else if (!response.ok) {
              console.error("Failed to delete budget on server:", response.status);
            }
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error deleting budget:", error);
    }
  };

  return { budgets, loading, refetch: fetchBudgets, addBudget, updateBudget, deleteBudget };
}
