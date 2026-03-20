import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Category } from "../types";

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data && data.length > 0 ? data : DEFAULT_CATEGORIES);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const addCategory = async (category: Omit<Category, "id">) => {
    try {
      const newCategory = { ...category, id: Date.now().toString() };
      const response = await fetch(`${API_URL}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCategory),
      });
      if (response.ok) {
        const savedCategory = await response.json();
        setCategories((prev) => [...prev, savedCategory]);
      } else {
          // Fallback if API fails
          setCategories((prev) => [...prev, newCategory]);
      }
    } catch (error) {
      console.error("Error adding category:", error);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/categories/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setCategories((prev) => prev.filter((c) => c.id !== id));
      } else {
          // Fallback
           setCategories((prev) => prev.filter((c) => c.id !== id));
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
