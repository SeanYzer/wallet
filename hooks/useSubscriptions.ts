import { useState, useEffect } from "react";
import { Subscription } from "../types";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export function useSubscriptions() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(false);

    const { activeUserId } = useAuth();

    useEffect(() => {
        if (!activeUserId) return;
        fetchSubscriptions();
    }, [activeUserId]);

    const fetchSubscriptions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/subscriptions?userId=${activeUserId}`);
            if (!response.ok) return;
            const data = await response.json();
            setSubscriptions(data);
        } catch (error) {
            console.error("Error fetching subscriptions:", error);
        } finally {
            setLoading(false);
        }
    };

    const updateSubscription = async (id: string, updates: Partial<Subscription>) => {
        try {
            const response = await fetch(`${API_URL}/subscriptions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...updates, userId: activeUserId }),
            });
            const updatedSubscription = await response.json();
            setSubscriptions((prev) => prev.map((s) => (s.id === id ? updatedSubscription : s)));
        } catch (error) {
            console.error("Error updating subscription:", error);
        }
    };

    const addSubscription = async (subscription: Omit<Subscription, "id">) => {
        try {
            const response = await fetch(`${API_URL}/subscriptions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...subscription, id: Date.now().toString(), userId: activeUserId }),
            });
            if (!response.ok) throw new Error(`Failed to add subscription: ${response.status}`);
            const newSub = await response.json();
            setSubscriptions((prev) => [...prev, newSub]);
        } catch (error) {
            console.error("Error adding subscription:", error);
            throw error;
        }
    };

    const deleteSubscription = async (id: string) => {
        try {
            await fetch(`${API_URL}/subscriptions/${id}`, { method: "DELETE" });
            setSubscriptions((prev) => prev.filter((s) => s.id !== id));
        } catch (error) {
            console.error("Error deleting subscription:", error);
        }
    };

    return { subscriptions, loading, refetch: fetchSubscriptions, addSubscription, deleteSubscription };
}
