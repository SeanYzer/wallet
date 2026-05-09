export type TransactionType = "income" | "expense";
export type DueFrequency = "once" | "weekly" | "biweekly" | "monthly" | "yearly";
export type PaymentMethod = string;

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
}

export interface Transaction {
  id: string;
  title?: string;
  amount: number;
  category: Category;
  date: string;
  note?: string;
  receiptUrl?: string;
  type: TransactionType;
  paymentMethod?: PaymentMethod;
  establishment?: string;
  splitInfo?: {
    people: number;
    amountPerPerson: number;
    notes?: string;
    participants?: { name: string; amount: number; paid: boolean }[];
  };
  dueId?: string;
}

export interface Due {
  id: string;
  title: string;
  amount: number;
  date: string;
  frequency?: DueFrequency;
  type: TransactionType;
  categoryId?: string;
  autoProcess?: boolean;
  completed?: boolean;
}

export interface SavingsItem {
  id: string;
  title: string;
  balance: number;
  icon?: string;
  color?: string;
}
