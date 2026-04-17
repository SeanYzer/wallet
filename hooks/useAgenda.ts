import { useState, useEffect } from "react";
import { Agenda } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getAgendas, saveAgenda, saveAgendasBulk, deleteAgendaLocal, updateAgendaLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";

export function useAgenda() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(false);

  const { activeUserId } = useAuth();

  useEffect(() => {
    if (!activeUserId) return;
    fetchAgendas();
  }, [activeUserId]);

  const fetchAgendas = async () => {
    setLoading(true);
    try {
      // 1. Always load from local first (source of truth)
      const localData = await getAgendas();
      setAgendas(localData);

      // 2. Background sync from API if enabled
      if (USE_API && activeUserId) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          const response = await authFetch(`/api/agendas`);
          if (response.ok) {
            const remoteData = await response.json();
            if (Array.isArray(remoteData) && remoteData.length > 0) {
              await saveAgendasBulk(remoteData);
              const merged = await getAgendas();
              setAgendas(merged);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching agendas:", error);
    } finally {
      setLoading(false);
    }
  };

  const addAgenda = async (agenda: Omit<Agenda, "id">) => {
    try {
      const newAgenda = { ...agenda, id: Date.now().toString(), userId: activeUserId } as Agenda;

      // 1. Save locally first
      await saveAgenda(newAgenda);
      setAgendas((prev) => [...prev, newAgenda]);

      // 2. Background sync to API
      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/agendas`, {
            method: "POST",
            body: JSON.stringify({
              title: newAgenda.title,
              date: newAgenda.date,
              amount: newAgenda.amount ?? 0,
              completed: newAgenda.completed ?? false,
              userId: activeUserId,
            }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error adding agenda:", error);
      throw error;
    }
  };

  const updateAgenda = async (id: string, updates: Partial<Agenda>) => {
    try {
      // 1. Update locally first
      await updateAgendaLocal(id, updates);
      setAgendas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));

      // 2. Background sync to API
      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/agendas/${id}`, {
            method: "PUT",
            body: JSON.stringify({ ...updates, userId: activeUserId }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error updating agenda:", error);
    }
  };

  const deleteAgenda = async (id: string) => {
    try {
      // 1. Delete locally first
      await deleteAgendaLocal(id);
      setAgendas((prev) => prev.filter((a) => a.id !== id));

      // 2. Background sync to API
      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/agendas/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error deleting agenda:", error);
    }
  };

  return { agendas, loading, refetch: fetchAgendas, addAgenda, updateAgenda, deleteAgenda };
}
