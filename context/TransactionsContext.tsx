import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import { Transaction } from "../types";
import { getTransactions, saveTransaction, updateTransactionLocal, deleteTransactionLocal, getSetting } from "../utils/db";
import { useAuth } from "./AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

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
            const data = await getTransactions();
            setTransactions(data);
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
            
            const autoBackup = await getSetting('autoBackup');
            if (autoBackup === 'true') {
                fetch(`${API_URL}/transactions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...newTransaction, userId: activeUserId }),
                }).catch(err => console.error("Sync error:", err));
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
            
            const autoBackup = await getSetting('autoBackup');
            if (autoBackup === 'true') {
                fetch(`${API_URL}/transactions/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...updates, userId: activeUserId }),
                }).catch(err => console.error("Sync error:", err));
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
            
            const autoBackup = await getSetting('autoBackup');
            if (autoBackup === 'true') {
                fetch(`${API_URL}/transactions/${id}`, { method: "DELETE" }).catch(err => console.error("Sync error:", err));
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
