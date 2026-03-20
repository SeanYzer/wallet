import { useState, useEffect } from "react";
import { Subscription } from "../types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export function useSubscriptions() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    const fetchSubscriptions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/subscriptions`);
            const data = await response.json();
            setSubscriptions(data);
        } catch (error) {
            console.error("Error fetching subscriptions:", error);
        } finally {
            setLoading(false);
        }
    };

    const addSubscription = async (subscription: Omit<Subscription, "id">) => {
        try {
            const response = await fetch(`${API_URL}/subscriptions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...subscription, id: Date.now().toString() }),
            });
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
