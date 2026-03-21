import { useState, useEffect } from "react";
import { Platform } from "react-native";
import { Agenda } from "../types";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

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
      const response = await fetch(`${API_URL}/agendas?userId=${activeUserId}`);
      if (!response.ok) return;
      const data = await response.json();
      setAgendas(data);
    } catch (error) {
      console.error("Error fetching agendas:", error);
    } finally {
      setLoading(false);
    }
  };

  const addAgenda = async (agenda: Omit<Agenda, "id">) => {
    try {
      const response = await fetch(`${API_URL}/agendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...agenda, id: Date.now().toString(), userId: activeUserId }),
      });
      if (!response.ok) throw new Error(`Failed to add agenda: ${response.status}`);
      const newAgenda = await response.json();
      setAgendas((prev) => [...prev, newAgenda]);
    } catch (error) {
      console.error("Error adding agenda:", error);
      throw error;
    }
  };

  const updateAgenda = async (id: string, updates: Partial<Agenda>) => {
    try {
      const response = await fetch(`${API_URL}/agendas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, userId: activeUserId }),
      });
      const updatedAgenda = await response.json();
      setAgendas((prev) => prev.map((a) => (a.id === id ? updatedAgenda : a)));
    } catch (error) {
      console.error("Error updating agenda:", error);
    }
  };

  const deleteAgenda = async (id: string) => {
    try {
      await fetch(`${API_URL}/agendas/${id}`, { method: "DELETE" });
      setAgendas((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error deleting agenda:", error);
    }
  };

  return { agendas, loading, refetch: fetchAgendas, addAgenda, updateAgenda, deleteAgenda };
}
