import { useState, useEffect } from "react";
import { Platform } from "react-native";
import { Agenda } from "../types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export function useAgenda() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAgendas();
  }, []);

  const fetchAgendas = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/agendas`);
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
        body: JSON.stringify({ ...agenda, id: Date.now().toString() }),
      });
      if (!response.ok) throw new Error("Failed to add agenda");
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
        body: JSON.stringify(updates),
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
