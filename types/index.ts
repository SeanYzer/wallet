export type TransactionType = "income" | "expense";
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
  date: string; // ISO string
  note?: string;
  receiptUrl?: string;
  type: TransactionType;
  paymentMethod?: PaymentMethod;
  establishment?: string; // Where the transaction took place
  splitInfo?: {
    people: number;
    amountPerPerson: number;
    notes?: string;
    participants?: { name: string; amount: number; paid: boolean }[];
  };
  budgetId?: string;
  savingsGoalId?: string;
}

export interface Budget {
  id: string;
  categoryId: string | number;
  amount: number;
  month: string; // YYYY-MM
}

export interface Agenda {
  id: string;
  title: string;
  date: string; // ISO string
  amount?: number;
  isRecurring?: boolean;
  completed?: boolean;
  budgetId?: string;
  savingsGoalId?: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  dueDate: number; // Day of month (1-31)
  category: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  icon?: string;
  color?: string;
}
