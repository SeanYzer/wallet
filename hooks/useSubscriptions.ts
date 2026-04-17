import { useState, useEffect } from "react";
import { Subscription } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getSubscriptions, saveSubscription, deleteSubscriptionLocal, updateSubscriptionLocal } from "../utils/db";
import { authFetch } from "../utils/apiClient";

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
            if (USE_API) {
                const response = await authFetch(`/api/subscriptions?userId=${activeUserId}`);
                if (!response.ok) return;
                const data = await response.json();
                setSubscriptions(data);
            } else {
                const data = await getSubscriptions();
                setSubscriptions(data);
            }
        } catch (error) {
            console.error("Error fetching subscriptions:", error);
        } finally {
            setLoading(false);
        }
    };

    const updateSubscription = async (id: string, updates: Partial<Subscription>) => {
        try {
            if (USE_API) {
                const response = await authFetch(`/api/subscriptions/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({ ...updates, userId: activeUserId }),
                });
                const updatedData = await response.json();
                setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
            } else {
                await updateSubscriptionLocal(id, updates);
                setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
            }
        } catch (error) {
            console.error("Error updating subscription:", error);
        }
    };

    const addSubscription = async (subscription: Omit<Subscription, "id">) => {
        try {
            const newSub = { ...subscription, id: Date.now().toString(), userId: activeUserId } as any;

            if (USE_API) {
                const response = await authFetch(`/api/subscriptions`, {
                    method: "POST",
                    body: JSON.stringify(newSub),
                });
                if (!response.ok) throw new Error(`Failed to add subscription: ${response.status}`);
                const saved = await response.json();
                setSubscriptions((prev) => [...prev, saved]);
            } else {
                await saveSubscription(newSub);
                setSubscriptions((prev) => [...prev, newSub]);
            }
        } catch (error) {
            console.error("Error adding subscription:", error);
            throw error;
        }
    };

    const deleteSubscription = async (id: string) => {
        try {
            if (USE_API) {
                await authFetch(`/api/subscriptions/${id}`, { method: "DELETE" });
            } else {
                await deleteSubscriptionLocal(id);
            }
            setSubscriptions((prev) => prev.filter((s) => s.id !== id));
        } catch (error) {
            console.error("Error deleting subscription:", error);
        }
    };

    return { subscriptions, loading, refetch: fetchSubscriptions, addSubscription, deleteSubscription };
}
