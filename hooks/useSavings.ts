import { useState, useEffect } from "react";
import { SavingsItem } from "../types";
import { useAuth } from "../context/AuthContext";
import { API_URL, getSavingsItems, saveSavingsItem, saveSavingsItemsBulk, deleteSavingsItemLocal, updateSavingsItemLocal, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { enqueueAndTrigger, processSyncQueue } from "../utils/syncProcessor";
import { generateUUID } from "../utils/uuid";

export function useSavings() {
    const [items, setItems] = useState<SavingsItem[]>([]);
    const [loading, setLoading] = useState(false);

    const { activeUserId } = useAuth();

    useEffect(() => {
        if (!activeUserId) return;
        fetchItems();
    }, [activeUserId]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const localData = await getSavingsItems();
            setItems(localData);

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && activeUserId && autoBackup !== 'false') {
                const response = await authFetch(`savingsItems?userId=${activeUserId}`);
                if (response.ok) {
                    const remoteData: SavingsItem[] = await response.json();
                    if (Array.isArray(remoteData)) {
                        const localMap = new Map(localData.map(g => [g.id, g]));
                        const remoteMap = new Map(remoteData.map(g => [g.id, g]));
                        const remoteTitleMap = new Map(remoteData.map(g => [g.title.toLowerCase(), g]));

                        const mergedMap = new Map<string, SavingsItem>();

                        for (const remoteItem of remoteData) {
                            mergedMap.set(remoteItem.id, remoteItem);
                        }

                        for (const localItem of localData) {
                            if (remoteMap.has(localItem.id)) continue;
                            if (remoteTitleMap.has(localItem.title.toLowerCase())) continue;
                            mergedMap.set(localItem.id, localItem);
                            await enqueueAndTrigger('savingsItems', 'create', localItem.id, localItem);
                        }

                        const merged = Array.from(mergedMap.values());
                        await saveSavingsItemsBulk(merged);
                        setItems(merged);
                    }
                }

                processSyncQueue();
            }
        } catch (error) {
            console.error("Error fetching savings items:", error);
        } finally {
            setLoading(false);
        }
    };

    const addItem = async (item: Omit<SavingsItem, "id">) => {
        try {
            const existing = items.find(g => g.title.toLowerCase() === item.title.toLowerCase());
            if (existing) {
                await updateItem(existing.id, item);
                return;
            }

            const newItem = { ...item, id: generateUUID(), userId: activeUserId } as any;

            await saveSavingsItem(newItem);
            setItems((prev) => [...prev, newItem]);

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && autoBackup !== 'false') {
                const syncData = { ...newItem, userId: activeUserId };
                await enqueueAndTrigger('savingsItems', 'create', newItem.id, syncData);
            }
        } catch (error) {
            console.error("Error adding savings item:", error);
            throw error;
        }
    };

    const updateItem = async (id: string, updates: Partial<SavingsItem>) => {
        try {
            await updateSavingsItemLocal(id, updates);
            setItems((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && autoBackup !== 'false') {
                const syncData = { ...updates, userId: activeUserId };
                await enqueueAndTrigger('savingsItems', 'update', id, syncData);
            }
        } catch (error) {
            console.error("Error updating savings item:", error);
        }
    };

    const deleteItem = async (id: string) => {
        try {
            await deleteSavingsItemLocal(id);
            setItems((prev) => prev.filter((g) => g.id !== id));

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && autoBackup !== 'false') {
                await enqueueAndTrigger('savingsItems', 'delete', id);
            }
        } catch (error) {
            console.error("Error deleting savings item:", error);
        }
    };

    return { items, loading, refetch: fetchItems, addItem, updateItem, deleteItem };
}
