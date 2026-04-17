import { useState, useEffect } from "react";
import { Agenda } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getAgendas, saveAgenda, deleteAgendaLocal, updateAgendaLocal } from "../utils/db";
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
      if (USE_API) {
        const response = await authFetch(`/api/agendas?userId=${activeUserId}`);
        if (!response.ok) return;
        const data = await response.json();
        setAgendas(data);
      } else {
        const data = await getAgendas();
        setAgendas(data);
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

      if (USE_API) {
        const response = await authFetch(`/api/agendas`, {
          method: "POST",
          body: JSON.stringify(newAgenda),
        });
        if (!response.ok) throw new Error(`Failed to add agenda: ${response.status}`);
        const saved = await response.json();
        setAgendas((prev) => [...prev, saved]);
      } else {
        await saveAgenda(newAgenda);
        setAgendas((prev) => [...prev, newAgenda]);
      }
    } catch (error) {
      console.error("Error adding agenda:", error);
      throw error;
    }
  };

  const updateAgenda = async (id: string, updates: Partial<Agenda>) => {
    try {
      if (USE_API) {
        const response = await authFetch(`/api/agendas/${id}`, {
          method: "PUT",
          body: JSON.stringify({ ...updates, userId: activeUserId }),
        });
        const updatedData = await response.json();
        setAgendas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      } else {
        await updateAgendaLocal(id, updates);
        setAgendas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      }
    } catch (error) {
      console.error("Error updating agenda:", error);
    }
  };

  const deleteAgenda = async (id: string) => {
    try {
      if (USE_API) {
        await authFetch(`/api/agendas/${id}`, { method: "DELETE" });
      } else {
        await deleteAgendaLocal(id);
      }
      setAgendas((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error deleting agenda:", error);
    }
  };

  return { agendas, loading, refetch: fetchAgendas, addAgenda, updateAgenda, deleteAgenda };
}
