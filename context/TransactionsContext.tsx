import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Transaction } from "../types";
import {
    getTransactions,
    saveTransaction,
    saveTransactionsBulk,
    updateTransactionLocal,
    deleteTransactionLocal,
    getSetting,
    API_URL
} from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";
import { useUserProfile } from "./UserProfileContext";
import { generateUUID } from "../utils/uuid";
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer'; // Necessary for direct blob upload if needed

interface TransactionsContextType {
    transactions: Transaction[];
    loading: boolean;
    refetch: () => Promise<void>;
    addTransaction: (transaction: Omit<Transaction, "id">) => Promise<void>;
    updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined);

export function TransactionsProvider({ children }: { children: ReactNode }) {
    const { activeUserId } = useAuth();
    const { profile } = useUserProfile();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!activeUserId) return;
        fetchTransactions();
    }, [activeUserId]);

    /**
     * FETCH = LOCAL ONLY (Offline-first)
     */
    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const localData = await getTransactions();
            setTransactions(localData);

            if (API_URL && activeUserId) {
                syncWithServer(localData); // background
            }

        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * BACKGROUND SYNC (single endpoint)
     */
    const syncWithServer = async (localData: Transaction[]) => {
        try {
            if (profile?.autoBackup === false) return;

            // 1. Check for local images that need uploading to Supabase
            const dataWithCloudImages = await Promise.all(localData.map(async (tx) => {
                // If it's a local file URI, we need to upload it to our secured bucket
                if (tx.receiptUrl && tx.receiptUrl.startsWith('file://')) {
                    try {
                        const fileName = `${tx.id}.jpg`;
                        const securedPath = `${activeUserId}/${fileName}`; // Security Path Enforcement

                        // We use a dedicated endpoint or direct Supabase upload logic here
                        // For now, let's assume we use an authFetch-compatible upload route
                        const base64 = await FileSystem.readAsStringAsync(tx.receiptUrl, {
                            encoding: 'base64',
                        });

                        const uploadRes = await authFetch(`storage/upload`, {
                            method: "POST",
                            body: JSON.stringify({
                                path: securedPath,
                                fileBase64: base64,
                                bucket: 'receipts'
                            })
                        });

                        if (uploadRes.ok) {
                            const { url } = await uploadRes.json();
                            return { ...tx, receiptUrl: url };
                        }
                    } catch (e) {
                        console.error("Failed to sync image to cloud:", e);
                    }
                }
                return tx;
            }));

             // 2. Sync transactions with cloud-ready URLs
             const response = await authFetch(`transactions/sync`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({
                     transactions: dataWithCloudImages,
                     userId: activeUserId
                 })
             });

             if (!response.ok) return;

            const json = await response.json();
            const remoteData: Transaction[] = json?.data?.transactions;

            if (!Array.isArray(remoteData)) return;

            await mergeTransactions(remoteData);

            const updatedLocal = await getTransactions();
            setTransactions(updatedLocal);

        } catch (err) {
            console.error("Background sync failed:", err);
        }
    };

    /**
     * MERGE with Last-Write-Wins (LWW) conflict resolution
     * Uses updatedAt timestamp to determine winner
     */
    const mergeTransactions = async (remoteData: Transaction[]) => {
        const localData = await getTransactions();
        const now = Date.now();

        const mergedMap = new Map<string, Transaction>();

        // Helper: ensure item has updatedAt (backward compat)
        const getUpdatedAt = (item: any): number => {
            if (typeof item.updatedAt === 'number' && item.updatedAt > 0) {
                return item.updatedAt;
            }
            return 0;
        };

        // Add all local items
        for (const tx of localData) {
            mergedMap.set(tx.id, tx);
        }

        // For remote items: only replace if remote is newer (LWW)
        for (const remoteTx of remoteData) {
            const localTx = mergedMap.get(remoteTx.id);

            if (!localTx) {
                // Local doesn't have this - add it
                mergedMap.set(remoteTx.id, remoteTx);
            } else {
                // Both have it - LWW: pick the one with newer updatedAt
                const localTs = getUpdatedAt(localTx);
                const remoteTs = getUpdatedAt(remoteTx);

                if (remoteTs > localTs) {
                    // Remote is newer - use remote
                    mergedMap.set(remoteTx.id, remoteTx);
                }
                // Else: local is newer or same - keep local
            }
        }

        const merged = Array.from(mergedMap.values());

        // persist clean dataset in bulk to avoid race conditions and improve performance
        await saveTransactionsBulk(merged);

        return merged;
    };
    /**
     * ADD
     */
    const addTransaction = async (transaction: Omit<Transaction, "id">) => {
        try {
            const newTransaction: Transaction = {
                ...transaction,
                id: generateUUID()
            };

            await saveTransaction(newTransaction);
            
            let syncData: Transaction[] = [];
            setTransactions(prev => {
                syncData = [...prev, newTransaction];
                return syncData;
            });

            if (API_URL && activeUserId) {
                syncWithServer(syncData);
            }

        } catch (error) {
            console.error("Error adding transaction:", error);
            throw error;
        }
    };

    /**
     * UPDATE
     */
    const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
        try {
            await updateTransactionLocal(id, updates);

            let syncData: Transaction[] = [];
            setTransactions(prev => {
                syncData = prev.map(t =>
                    t.id === id ? { ...t, ...updates } : t
                );
                return syncData;
            });

            if (API_URL && activeUserId) {
                syncWithServer(syncData);
            }

        } catch (error) {
            console.error("Error updating transaction:", error);
            throw error;
        }
    };

    /**
     * DELETE
     */
    const deleteTransaction = async (id: string) => {
        try {
            await deleteTransactionLocal(id);

            let syncData: Transaction[] = [];
            setTransactions(prev => {
                syncData = prev.filter(t => t.id !== id);
                return syncData;
            });

            if (API_URL && activeUserId) {
                syncWithServer(syncData);
            }

        } catch (error) {
            console.error("Error deleting transaction:", error);
            throw error;
        }
    };

    return (
        <TransactionsContext.Provider
            value={{
                transactions,
                loading,
                refetch: fetchTransactions,
                addTransaction,
                updateTransaction,
                deleteTransaction
            }}
        >
            {children}
        </TransactionsContext.Provider>
    );
}

export function useTransactionsContext() {
    const context = useContext(TransactionsContext);
    if (!context) {
        throw new Error("useTransactionsContext must be used within a TransactionsProvider");
    }
    return context;
}