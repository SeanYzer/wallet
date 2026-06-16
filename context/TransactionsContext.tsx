import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Transaction } from "../types";
import {
    getSetting,
    API_URL
} from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";
import { useUserProfile } from "./UserProfileContext";
import { useRepositories } from "./RepositoryContext";
import { generateUUID } from "../utils/uuid";
import * as FileSystem from 'expo-file-system/legacy';
import { enqueueAndTrigger, processSyncQueue } from "../utils/syncProcessor";

interface TransactionsContextType {
    transactions: Transaction[];
    loading: boolean;
    refetch: () => Promise<void>;
    addTransaction: (transaction: Omit<Transaction, "id">) => Promise<void>;
    updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined);

const sanitizeTransaction = (t: Transaction): Transaction => {
    const withTimestamp = { ...t, updatedAt: t.updatedAt || Date.now() };
    if ((withTimestamp as any).note === undefined) (withTimestamp as any).note = null;
    if ((withTimestamp as any).receiptUrl === undefined) (withTimestamp as any).receiptUrl = null;
    return withTimestamp as Transaction;
};

const addCategoryFallback = (t: Transaction): Transaction => ({
    ...t,
    category: t.category || { id: 'uncategorized', name: 'Others', type: t.type || 'expense', updatedAt: 0 },
});

export function TransactionsProvider({ children }: { children: ReactNode }) {
    const { activeUserId } = useAuth();
    const { profile } = useUserProfile();
    const { transactions: txRepo } = useRepositories();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);

    const uploadReceiptIfNeeded = async (tx: Transaction): Promise<Transaction> => {
        if (tx.receiptUrl && tx.receiptUrl.startsWith('file://')) {
            try {
                const fileName = `${tx.id}.jpg`;
                const securedPath = `${activeUserId}/${fileName}`;
                const base64 = await FileSystem.readAsStringAsync(tx.receiptUrl, {
                    encoding: 'base64',
                });
                const { ok, data: uploadData } = await authFetch(`storage/upload`, {
                    method: "POST",
                    body: JSON.stringify({
                        path: securedPath,
                        fileBase64: base64,
                        bucket: 'receipts'
                    })
                });
                if (ok && uploadData?.url) {
                    return { ...tx, receiptUrl: uploadData.url };
                }
            } catch (e) {
                console.error("Failed to sync image to cloud:", e);
            }
        }
        return tx;
    };

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const localData = (await txRepo.getAll()).map(addCategoryFallback);
            setTransactions(localData);

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && activeUserId && autoBackup !== 'false') {
                const { ok, data: remoteData } = await authFetch<Transaction[]>(`transactions?userId=${activeUserId}`);
                if (ok && Array.isArray(remoteData)) {
                    const localMap = new Map(localData.map(tx => [tx.id, tx]));
                    const remoteMap = new Map(remoteData.map(tx => [tx.id, tx]));

                    const mergedMap = new Map<string, Transaction>();

                    for (const remoteTx of remoteData) {
                        mergedMap.set(remoteTx.id, remoteTx);
                    }

                    for (const localTx of localData) {
                        if (!remoteMap.has(localTx.id)) {
                            const uploaded = await uploadReceiptIfNeeded(localTx);
                            mergedMap.set(localTx.id, uploaded);
                            await enqueueAndTrigger('transactions', 'create', localTx.id, {
                                ...uploaded,
                                userId: activeUserId,
                            });
                        }
                    }

                    const merged = Array.from(mergedMap.values());
                    await txRepo.upsertBulk(merged.map(sanitizeTransaction));
                    setTransactions(merged);
                }
            }

            processSyncQueue();
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeUserId, txRepo]);

    useEffect(() => {
        if (!activeUserId) return;
        fetchTransactions();
    }, [activeUserId, fetchTransactions]);

    const addTransaction = async (transaction: Omit<Transaction, "id">) => {
        try {
            const newTransaction: Transaction = {
                ...transaction,
                id: generateUUID()
            };

            await txRepo.upsert(sanitizeTransaction(newTransaction));
            setTransactions((prev) => [...prev, newTransaction]);

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && autoBackup !== 'false') {
                const uploaded = await uploadReceiptIfNeeded(newTransaction);
                const syncData = { ...uploaded, userId: activeUserId };
                await enqueueAndTrigger('transactions', 'create', newTransaction.id, syncData);
            }
        } catch (error) {
            console.error("Error adding transaction:", error);
            throw error;
        }
    };

    const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
        try {
            const item = await txRepo.getById(id);
            if (item) {
                await txRepo.upsert(sanitizeTransaction({ ...item, ...updates } as Transaction));
            }
            setTransactions((prev) => prev.map(t =>
                t.id === id ? { ...t, ...updates } : t
            ));

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && autoBackup !== 'false') {
                const syncData = { ...updates, userId: activeUserId };
                await enqueueAndTrigger('transactions', 'update', id, syncData);
            }
        } catch (error) {
            console.error("Error updating transaction:", error);
            throw error;
        }
    };

    const deleteTransaction = async (id: string) => {
        try {
            await txRepo.deleteById(id);
            setTransactions((prev) => prev.filter(t => t.id !== id));

            const autoBackup = await getSetting('autoBackup');
            if (API_URL && autoBackup !== 'false') {
                await enqueueAndTrigger('transactions', 'delete', id);
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
