import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Transaction } from "../types";
import {
    getTransactions,
    saveTransaction,
    updateTransactionLocal,
    deleteTransactionLocal,
    getSetting,
    USE_API
} from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";
import { generateUUID } from "../utils/uuid";

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

            if (USE_API && activeUserId) {
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
            const autoBackup = await getSetting("autoBackup");
            if (autoBackup === "false") return;

            const response = await authFetch(`transactions/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transactions: localData,
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
     * MERGE (Insert + Update, no duplicates)
     */
    const mergeTransactions = async (remoteData: Transaction[]) => {
        const localData = await getTransactions();
        const localMap = new Map(localData.map(t => [t.id, t]));

        for (const remoteTx of remoteData) {
            if (!localMap.has(remoteTx.id)) {
                await saveTransaction(remoteTx);
            } else {
                await updateTransactionLocal(remoteTx.id, remoteTx);
            }
        }
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
            setTransactions(prev => [...prev, newTransaction]);

            if (USE_API && activeUserId) {
                syncWithServer([...transactions, newTransaction]);
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

            const updatedTransactions = transactions.map(t =>
                t.id === id ? { ...t, ...updates } : t
            );

            setTransactions(updatedTransactions);

            if (USE_API && activeUserId) {
                syncWithServer(updatedTransactions);
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

            const updatedTransactions = transactions.filter(t => t.id !== id);
            setTransactions(updatedTransactions);

            if (USE_API && activeUserId) {
                syncWithServer(updatedTransactions);
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