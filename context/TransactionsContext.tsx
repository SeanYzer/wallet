import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import { Transaction } from "../types";

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
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchTransactions();
    }, []);

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/transactions`);
            const data = await response.json();
            setTransactions(data);
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setLoading(false);
        }
    };

    const addTransaction = async (transaction: Omit<Transaction, "id">) => {
        try {
            const response = await fetch(`${API_URL}/transactions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...transaction, id: Date.now().toString() }),
            });
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to add transaction: ${response.status} ${errorData}`);
            }
            const newTransaction = await response.json();
            setTransactions((prev) => [...prev, newTransaction]);
        } catch (error) {
            console.error("Error adding transaction:", error);
            throw error;
        }
    };

    const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
        try {
            const response = await fetch(`${API_URL}/transactions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to update transaction: ${response.status} ${errorData}`);
            }
            const updatedTransaction = await response.json();
            setTransactions((prev) => prev.map((t) => (t.id === id ? updatedTransaction : t)));
        } catch (error) {
            console.error("Error updating transaction:", error);
            throw error;
        }
    };

    const deleteTransaction = async (id: string) => {
        try {
            const response = await fetch(`${API_URL}/transactions/${id}`, { method: "DELETE" });
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to delete transaction: ${response.status} ${errorData}`);
            }
            setTransactions((prev) => prev.filter((t) => t.id !== id));
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
