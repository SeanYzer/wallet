import React, { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "tl";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  en: {
    settings: "Settings",
    appearance: "Appearance",
    language: "Language",
    currency: "Currency",
    categories: "Categories",
    passcode: "Passcode",
    darkMode: "Dark Mode",
    systemMode: "System Mode",
    income: "Income",
    expense: "Expense",
    back: "Back",
    save: "Save",
    add: "Add",
    delete: "Delete",
    confirm: "Confirm",
    cancel: "Cancel",
  },
  tl: {
    settings: "Kasangkapan",
    appearance: "Hitsura",
    language: "Wika",
    currency: "Salapi",
    categories: "Mga Kategorya",
    passcode: "Passcode",
    darkMode: "Dark Mode",
    systemMode: "System Mode",
    income: "Kita",
    expense: "Gastos",
    back: "Bumalik",
    save: "I-save",
    add: "Idagdag",
    delete: "Burahin",
    confirm: "Kumpirmahin",
    cancel: "Kanselahin",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

import { useUserProfile } from "./UserProfileContext";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile } = useUserProfile();
  const language = (profile?.language as Language) || "en";

  const setLanguage = (lang: Language) => {
    updateProfile({ language: lang });
  };

  const t = (key: string) => {
    return (translations[language] as any)[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
