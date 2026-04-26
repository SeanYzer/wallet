import { useState, useEffect } from "react";
import { Subscription } from "../types";
import { useAuth } from "../context/AuthContext";
import { USE_API, getSubscriptions, saveSubscription, saveSubscriptionsBulk, deleteSubscriptionLocal, updateSubscriptionLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { generateUUID } from "../utils/uuid";

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
            // 1. Always load from local first (source of truth)
            const localData = await getSubscriptions();
            setSubscriptions(localData);

            // 2. Background sync from API if enabled
            if (USE_API && activeUserId) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    const response = await authFetch(`subscriptions`);
                    if (response.ok) {
                        const remoteData = await response.json();
                        if (Array.isArray(remoteData) && remoteData.length > 0) {
                            await saveSubscriptionsBulk(remoteData);
                            const merged = await getSubscriptions();
                            setSubscriptions(merged);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching subscriptions:", error);
        } finally {
            setLoading(false);
        }
    };

    const addSubscription = async (subscription: Omit<Subscription, "id">) => {
        try {
            const newSub = { ...subscription, id: generateUUID(), userId: activeUserId } as any;

            // 1. Save locally first
            await saveSubscription(newSub);
            setSubscriptions((prev) => [...prev, newSub]);

            // 2. Background sync to API
            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`subscriptions`, {
                        method: "POST",
                        body: JSON.stringify({
                            name: newSub.name,
                            amount: newSub.amount,
                            dueDate: newSub.dueDate,
                            category: newSub.category ?? null,
                            userId: activeUserId,
                        }),
                    }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error adding subscription:", error);
            throw error;
        }
    };

    const updateSubscription = async (id: string, updates: Partial<Subscription>) => {
        try {
            // 1. Update locally first
            await updateSubscriptionLocal(id, updates);
            setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));

            // 2. Background sync to API
            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`subscriptions/${id}`, {
                        method: "PUT",
                        body: JSON.stringify({ ...updates, userId: activeUserId }),
                    }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error updating subscription:", error);
        }
    };

    const deleteSubscription = async (id: string) => {
        try {
            // 1. Delete locally first
            await deleteSubscriptionLocal(id);
            setSubscriptions((prev) => prev.filter((s) => s.id !== id));

            // 2. Background sync to API
            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`subscriptions/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error deleting subscription:", error);
        }
    };

    return { subscriptions, loading, refetch: fetchSubscriptions, addSubscription, updateSubscription, deleteSubscription };
}
