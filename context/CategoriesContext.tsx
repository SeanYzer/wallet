import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Category } from "../types";
import { getCategories, saveCategory, deleteCategoryLocal, getSetting, API_URL, saveCategoriesBulk } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { enqueueAndTrigger, processSyncQueue } from "../utils/syncProcessor";
import { useAuth } from "./AuthContext";
import { generateUUID } from "../utils/uuid";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "1", name: "Food", type: "expense", updatedAt: 0 },
  { id: "2", name: "Bills", type: "expense", updatedAt: 0 },
  { id: "3", name: "Transport", type: "expense", updatedAt: 0 },
  { id: "4", name: "Shopping", type: "expense", updatedAt: 0 },
  { id: "5", name: "Entertainment", type: "expense", updatedAt: 0 },
  { id: "6", name: "Salary", type: "income", updatedAt: 0 },
  { id: "7", name: "Freelance", type: "income", updatedAt: 0 },
  { id: "8", name: "Others", type: "expense", updatedAt: 0 },
  { id: "9", name: "Others", type: "income", updatedAt: 0 },
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
  const isUUID = (value: any) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const fetchCategories = async () => {
    setLoading(true);

    try {
      let data: any[] = [];

      const localData = await getCategories();
      const validLocal = localData.filter(item => isUUID(item.id));

      if (validLocal.length > 0) {
        data = validLocal;
        setCategories(validLocal);
      }

      const autoBackup = await getSetting('autoBackup');
      if (API_URL && activeUserId && autoBackup !== 'false') {
        const { ok, data } = await authFetch("categories");

        if (ok && Array.isArray(data)) {
          await saveCategoriesBulk(data);
          setCategories(data);
        }

        processSyncQueue();
      }

    } catch (error) {
      console.error("Error fetching categories:", error);
      setCategories([]);
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
      const newCategory = { ...category, id: generateUUID() };
      await saveCategory(newCategory);
      setCategories((prev) => [...prev, newCategory]);

      const autoBackup = await getSetting('autoBackup');
      if (API_URL && autoBackup !== 'false') {
        const syncData = { ...newCategory, userId: activeUserId };
        await enqueueAndTrigger('categories', 'create', newCategory.id, syncData);
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
      if (API_URL && autoBackup !== 'false') {
        await enqueueAndTrigger('categories', 'delete', id);
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
