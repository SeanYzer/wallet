import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Category } from "../types";
import { getCategories, saveCategory, deleteCategoryLocal, getSetting } from "../utils/db";
import { useAuth } from "./AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "1", name: "Food", type: "expense" },
  { id: "2", name: "Bills", type: "expense" },
  { id: "3", name: "Transport", type: "expense" },
  { id: "4", name: "Shopping", type: "expense" },
  { id: "5", name: "Entertainment", type: "expense" },
  { id: "6", name: "Salary", type: "income" },
  { id: "7", name: "Freelance", type: "income" },
  { id: "8", name: "Others", type: "expense" },
  { id: "9", name: "Others", type: "income" },
];

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  addCategory: (category: Omit<Category, "id">) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { activeUserId } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      // 1. Initial Load from Local
      let data = await getCategories();
      if (data.length === 0) {
        // Seed database
        for (const cat of DEFAULT_CATEGORIES) {
          await saveCategory(cat);
        }
        data = await getCategories();
      }
      setCategories(data);

      // 2. Background Sync if enabled
      const autoBackup = await getSetting('autoBackup');
      if (autoBackup === 'true' && activeUserId) {
        const response = await fetch(`${API_URL}/categories?userId=${activeUserId}`);
        if (response.ok) {
            const remoteData = await response.json();
            if (Array.isArray(remoteData) && remoteData.length > 0) {
                const { saveCategoriesBulk, getCategories: getLatest } = await import("../utils/db");
                await saveCategoriesBulk(remoteData);
                const mergedData = await getLatest();
                setCategories(mergedData);
            }
        }
      }
    } catch (error) {
      console.error("Error fetching categories from DB:", error);
      if (categories.length === 0) setCategories(DEFAULT_CATEGORIES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeUserId) return;
    fetchCategories();
  }, [activeUserId]);

  const addCategory = async (category: Omit<Category, "id">) => {
    try {
      const newCategory = { ...category, id: Date.now().toString() };
      await saveCategory(newCategory);
      setCategories((prev) => [...prev, newCategory]);
      
      const autoBackup = await getSetting('autoBackup');
      if (autoBackup === 'true') {
        fetch(`${API_URL}/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...newCategory, userId: activeUserId }),
        }).catch(err => console.error("Sync error:", err));
      }
    } catch (error) {
      console.error("Error adding category:", error);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await deleteCategoryLocal(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      
      const autoBackup = await getSetting('autoBackup');
      if (autoBackup === 'true') {
        fetch(`${API_URL}/categories/${id}`, {
          method: "DELETE",
        }).catch(err => console.error("Sync error:", err));
      }
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  return (
    <CategoriesContext.Provider value={{ categories, loading, addCategory, deleteCategory, refetch: fetchCategories }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error("useCategories must be used within a CategoriesProvider");
  }
  return context;
}
