import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Category } from "../types";
import { getCategories, saveCategory, deleteCategoryLocal, getSetting, USE_API } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";

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
      const uniqueInitialData = Array.from(new Map(data.sort((a, b) => b.id.length - a.id.length).map(c => [c.name, c])).values());
      setCategories(uniqueInitialData);

      // 2. Background Sync if enabled AND API mode is ON
      if (USE_API && activeUserId) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          const response = await authFetch(`/api/categories`);
          if (response.ok) {
            const remoteData = await response.json();
            if (Array.isArray(remoteData) && remoteData.length > 0) {
              const { saveCategoriesBulk, getCategories: getLatest } = await import("../utils/db");
              await saveCategoriesBulk(remoteData);
              const mergedData = await getLatest();
              // Deduplicate by name, prioritizing backend (UUIDs are longer than local "1", "2" IDs)
              const uniqueData = Array.from(new Map(mergedData.sort((a, b) => b.id.length - a.id.length).map(c => [c.name, c])).values());
              setCategories(uniqueData);
            }
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

      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/categories`, {
            method: "POST",
            body: JSON.stringify({ ...newCategory, userId: activeUserId }),
          }).catch(err => console.error("Sync error:", err));
        }
      }
    } catch (error) {
      console.error("Error adding category:", error);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await deleteCategoryLocal(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));

      if (USE_API) {
        const autoBackup = await getSetting('autoBackup');
        if (autoBackup !== 'false') {
          authFetch(`/api/categories/${id}`, {
            method: "DELETE",
          }).catch(err => console.error("Sync error:", err));
        }
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
