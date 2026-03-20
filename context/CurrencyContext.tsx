import React, { createContext, useContext, useState, ReactNode } from "react";

export type CurrencyCode = "USD" | "PHP";

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar" },
  PHP: { code: "PHP", symbol: "₱", name: "Philippine Peso" },
};

interface CurrencyContextType {
  currency: CurrencyConfig;
  setCurrency: (code: CurrencyCode) => void;
  decimalPlaces: number;
  setDecimalPlaces: (places: number) => void;
  formatAmount: (amount: number | undefined | null) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>("PHP");
  const [decimalPlaces, setDecimalPlaces] = useState(2);

  const currency = CURRENCIES[currencyCode];

  const formatAmount = (amount: number | undefined | null): string => {
    const value = amount ?? 0;
    return `${currency.symbol}${value.toLocaleString("en-US", { 
      minimumFractionDigits: decimalPlaces, 
      maximumFractionDigits: decimalPlaces 
    })}`;
  };

  const setCurrency = (code: CurrencyCode) => {
    setCurrencyCode(code);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, decimalPlaces, setDecimalPlaces, formatAmount }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}

export { CURRENCIES };
