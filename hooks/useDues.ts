import { useState, useEffect } from "react";
import { Due } from "../types";
import { useAuth } from "../context/AuthContext";
import { API_URL, getDues, saveDue, saveDuesBulk, deleteDueLocal, updateDueLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { generateUUID } from "../utils/uuid";

export function useDues() {
  const [dues, setDues] = useState<Due[]>([]);
  const [loading, setLoading] = useState(false);
  const { activeUserId } = useAuth();

  useEffect(() => {
    if (!activeUserId) return;
    fetchDues();
  }, [activeUserId]);

  const fetchDues = async () => {
    setLoading(true);
    try {
      const localData = await getDues();
      setDues(localData);

      if (API_URL && activeUserId) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          const response = await authFetch(`dues`);
          if (response.ok) {
            const remoteData = await response.json();
            if (Array.isArray(remoteData)) {
              await saveDuesBulk(remoteData);
              const merged = await getDues();
              const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
              setDues(unique);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching dues:", error);
    } finally {
      setLoading(false);
    }
  };

  const addDue = async (due: Omit<Due, "id">) => {
    try {
      const newDue = { ...due, id: generateUUID(), userId: activeUserId } as Due;
      await saveDue(newDue);
      setDues((prev) => [...prev, newDue]);

      if (API_URL) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`dues`, {
            method: "POST",
            body: JSON.stringify({ ...newDue, userId: activeUserId }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error adding due:", error);
      throw error;
    }
  };

  const updateDue = async (id: string, updates: Partial<Due>) => {
    try {
      await updateDueLocal(id, updates);
      setDues((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));

      if (API_URL) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`dues/${id}`, {
            method: "PUT",
            body: JSON.stringify({ ...updates, userId: activeUserId }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error updating due:", error);
    }
  };

  const deleteDue = async (id: string) => {
    try {
      await deleteDueLocal(id);
      setDues((prev) => prev.filter((d) => d.id !== id));

      if (API_URL) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`dues/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error deleting due:", error);
    }
  };

  return { dues, loading, refetch: fetchDues, addDue, updateDue, deleteDue };
}
