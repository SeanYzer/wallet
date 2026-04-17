import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Transaction } from "../types";
import { getTransactions, saveTransaction, updateTransactionLocal, deleteTransactionLocal, getSetting, USE_API } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";

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

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            // 1. Initial Load from Local
            const localData = await getTransactions();
            setTransactions(localData);

            // 2. Background Sync if enabled AND API mode is ON
            if (USE_API && activeUserId) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    const response = await authFetch(`/api/transactions?userId=${activeUserId}`);
                    if (response.ok) {
                        const remoteData = await response.json();
                        if (Array.isArray(remoteData)) {
                            const { saveTransactionsBulk, getTransactions: getLatest } = await import("../utils/db");
                            await saveTransactionsBulk(remoteData);
                            const mergedData = await getLatest();
                            setTransactions(mergedData);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setLoading(false);
        }
    };

    const addTransaction = async (transaction: Omit<Transaction, "id">) => {
        try {
            const newTransaction = { ...transaction, id: Date.now().toString() } as Transaction;
            await saveTransaction(newTransaction);
            setTransactions((prev) => [...prev, newTransaction]);

            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`/api/transactions`, {
                        method: "POST",
                        body: JSON.stringify({
                            amount: newTransaction.amount,
                            date: newTransaction.date,
                            note: newTransaction.note,
                            type: newTransaction.type,
                            categoryId: String(newTransaction.category?.id ?? ""),
                            paymentMethod: newTransaction.paymentMethod,
                            establishment: newTransaction.establishment,
                            receiptUrl: newTransaction.receiptUrl,
                            userId: activeUserId,
                        }),
                    }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error adding transaction:", error);
            throw error;
        }
    };

    const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
        try {
            await updateTransactionLocal(id, updates);
            setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));

            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`/api/transactions/${id}`, {
                        method: "PUT",
                        body: JSON.stringify({ ...updates, userId: activeUserId }),
                    }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error updating transaction:", error);
            throw error;
        }
    };

    const deleteTransaction = async (id: string) => {
        try {
            await deleteTransactionLocal(id);
            setTransactions((prev) => prev.filter((t) => t.id !== id));

            if (USE_API) {
                const autoBackup = await getSetting('autoBackup');
                if (autoBackup !== 'false') {
                    authFetch(`/api/transactions/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
                }
            }
        } catch (error) {
            console.error("Error deleting transaction:", error);
            throw error;
        }
    };

    return (
        <TransactionsContext.Provider value={{ transactions, loading, refetch: fetchTransactions, addTransaction, updateTransaction, deleteTransaction }}>
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
