import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Category, Transaction, Agenda, Subscription, SavingsItem, Due, TimestampedEntity, Budget, UserProfile, PaymentMethodInfo } from '../types';
import { AsyncStorageTransactionRepository } from '../repositories/transaction.repo';
import { AsyncStorageCategoryRepository } from '../repositories/category.repo';
import { AsyncStorageDueRepository } from '../repositories/due.repo';
import { AsyncStorageSavingsItemRepository } from '../repositories/savings-item.repo';
import { AsyncStorageSubscriptionRepository } from '../repositories/subscription.repo';
import { AsyncStorageAgendaRepository } from '../repositories/agenda.repo';
import { AsyncStoragePaymentMethodRepository } from '../repositories/payment-method.repo';
import { AsyncStorageProfileRepository } from '../repositories/profile.repo';

const transactionRepo = new AsyncStorageTransactionRepository();
const categoryRepo = new AsyncStorageCategoryRepository();
const dueRepo = new AsyncStorageDueRepository();
const savingsItemRepo = new AsyncStorageSavingsItemRepository();
const subscriptionRepo = new AsyncStorageSubscriptionRepository();
const agendaRepo = new AsyncStorageAgendaRepository();
const paymentMethodRepo = new AsyncStoragePaymentMethodRepository();
const profileRepo = new AsyncStorageProfileRepository();

function nowTimestamp(): number {
  return Date.now();
}

function ensureTimestamp<T extends TimestampedEntity>(entity: T | any): T {
  if (!entity) return entity;
  if (typeof entity.updatedAt !== 'number' || entity.updatedAt <= 0) {
    return { ...entity, updatedAt: nowTimestamp() };
  }
  return entity;
}

function ensureAllTimestamps<T extends TimestampedEntity>(entities: (T | any)[]): T[] {
  return entities.map(e => ensureTimestamp(e));
}

function getUpdatedAt(item: any): number {
  if (typeof item.updatedAt === 'number' && item.updatedAt > 0) {
    return item.updatedAt;
  }
  return 0;
}

export function mergeLWW<T extends { id: any }>(localItems: T[], remoteItems: T[]): T[] {
  const mergedMap = new Map<string, T>();

  for (const item of localItems) {
    mergedMap.set(String(item.id), item);
  }

  for (const remoteItem of remoteItems) {
    const key = String(remoteItem.id);
    const localItem = mergedMap.get(key);

    if (!localItem) {
      mergedMap.set(key, remoteItem);
    } else {
      const localTs = getUpdatedAt(localItem);
      const remoteTs = getUpdatedAt(remoteItem);

      if (remoteTs > localTs) {
        mergedMap.set(key, remoteItem);
      }
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * --- Configuration ---
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL;

export const GLOBAL_CATEGORIES: Category[] = [
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', name: 'Food', type: 'expense', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b12', name: 'Bills', type: 'expense', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13', name: 'Transport', type: 'expense', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b14', name: 'Shopping', type: 'expense', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b15', name: 'Entertainment', type: 'expense', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b16', name: 'Salary', type: 'income', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b17', name: 'Freelance', type: 'income', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b18', name: 'Others', type: 'expense', isGlobal: true, updatedAt: 0 },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b19', name: 'Others', type: 'income', isGlobal: true, updatedAt: 0 },
];

export const GLOBAL_PAYMENT_METHODS = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Cash', type: 'cash', icon: 'cash' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', name: 'BPI Debit', type: 'bank', icon: 'bank' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', name: 'UnionBank', type: 'bank', icon: 'bank' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', name: 'GCash', type: 'e_wallet', icon: 'wallet' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', name: 'Maya', type: 'e_wallet', icon: 'wallet' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', name: 'Visa Card', type: 'card', icon: 'credit-card' },
];

export const CURRENT_SEED_VERSION = 1;

/**
 * --- Keys & Helpers ---
 * Data is stored as JSON strings.
 * User-specific keys are prefixed with user_{id}_
 */

const getPrefixedKey = async (baseKey: string, overrideUserId?: string): Promise<string> => {
  const userId = overrideUserId || await AsyncStorage.getItem('activeUserId');
  return userId ? `user_${userId}_${baseKey}` : `default_${baseKey}`;
};

async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const val = await AsyncStorage.getItem(key);
    return val ? JSON.parse(val) : defaultValue;
  } catch (e) {
    console.error(`Error reading key ${key}:`, e);
    return defaultValue;
  }
}

async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing key ${key}:`, e);
  }
}

function deduplicate<T extends { id: any }>(items: T[]): T[] {
  const seen = new Set();
  return items.filter(item => {
    const id = String(item.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// --- Lifecycle & Initialization (Stubs for compatibility) ---

export const initDb = async (overrideUserId?: string): Promise<void> => {
  // AsyncStorage doesn't need schema initialization
  if (overrideUserId) {
    await seedDefaults(overrideUserId);
  }
  return Promise.resolve();
};

export const initMasterDb = async (): Promise<void> => {
  const userId = await AsyncStorage.getItem('activeUserId');
  if (userId) {
    await seedDefaults(userId);
  }
  return Promise.resolve();
};

const seedDefaults = async (userId: string) => {
  const versionKey = 'last_seed_version';
  const lastVersion = parseInt(await getSetting(versionKey) || '0', 10);

  if (lastVersion < CURRENT_SEED_VERSION) {
    // 1. Merge Categories
    const catKey = `user_${userId}_categories`;
    const existingCats = await getItem<any[]>(catKey, []);
    const mergedCats = deduplicate([...existingCats, ...GLOBAL_CATEGORIES]);
    await setItem(catKey, mergedCats);

    // 2. Merge Payment Methods
    const pmKey = `user_${userId}_paymentMethods`;
    const existingPMs = await getItem<any[]>(pmKey, []);
    const mergedPMs = deduplicate([...existingPMs, ...GLOBAL_PAYMENT_METHODS]);
    await setItem(pmKey, mergedPMs);

    // 3. Update local version tracking
    await setSetting(versionKey, CURRENT_SEED_VERSION.toString());
    console.info(`Database seeded to version ${CURRENT_SEED_VERSION}`);
  }
};

export const getDb = async () => ({
  // Mock DB object if needed by any legacy calls, but we aim to replace all.
  runAsync: async () => { },
  closeAsync: async () => { },
});

export const setOnFatalError = (cb: () => void) => {
  // No fatal native errors in AsyncStorage normally
};

export const clearAllLocalData = async () => {
  const userId = await AsyncStorage.getItem('activeUserId');
  const prefix = userId ? `user_${userId}_` : `default_`;

  const keys = await AsyncStorage.getAllKeys();
  const userKeys = keys.filter(k =>
    k.startsWith(prefix) &&
    !k.endsWith('_profile') &&
    !k.endsWith('_settings')
  );
  await AsyncStorage.multiRemove(userKeys);
};

// --- Settings CRUD ---

export const getSetting = async (key: string): Promise<string | null> => {
  const fullKey = await getPrefixedKey('settings');
  const settings = await getItem<Record<string, string>>(fullKey, {});
  return settings[key] || null;
};

export const setSetting = async (key: string, value: string) => {
  const fullKey = await getPrefixedKey('settings');
  const settings = await getItem<Record<string, string>>(fullKey, {});
  settings[key] = value;
  await setItem(fullKey, settings);
};

// --- Profile CRUD ---

export const getUserProfile = async (overrideUserId?: string) => {
  if (overrideUserId) {
    const fullKey = await getPrefixedKey('profile', overrideUserId);
    const profile = await getItem<any>(fullKey, null);
    if (profile) {
      return { ...profile, isFirstRun: profile.isFirstRun === true || profile.isFirstRun === 1 };
    }
    return null;
  }
  return profileRepo.getById('default');
};

export const saveUserProfile = async (profile: Partial<UserProfile>, overrideUserId?: string) => {
  if (overrideUserId) {
    const fullKey = await getPrefixedKey('profile', overrideUserId);
    const current = await getUserProfile(overrideUserId) || {} as UserProfile;
    const updated = { ...current, ...profile };
    await setItem(fullKey, updated);
    return;
  }
  const current = await profileRepo.getById('default') || {} as UserProfile;
  await profileRepo.upsert({ ...current, ...profile } as UserProfile);
};

// --- Payment Methods ---

export const getPaymentMethods = async () => {
  return paymentMethodRepo.getAll();
};

export const savePaymentMethod = async (method: PaymentMethodInfo) => {
  await paymentMethodRepo.upsert(method);
};

// --- Categories CRUD ---

export const getCategories = async (): Promise<Category[]> => {
  return categoryRepo.getAll();
};

export const saveCategory = async (category: Category) => {
  await categoryRepo.upsert(category);
};

export const saveCategoriesBulk = async (categories: Category[]) => {
  await categoryRepo.upsertBulk(categories);
};

export const deleteCategoryLocal = async (id: string) => {
  await categoryRepo.deleteById(id);
};

// --- Budgets CRUD ---

export const getBudgets = async (): Promise<Budget[]> => {
  const fullKey = await getPrefixedKey('budgets');
  const items = await getItem<Budget[]>(fullKey, []);
  return deduplicate(items);
};

// --- Transactions CRUD ---

export const getTransactions = async (): Promise<Transaction[]> => {
  const items = await transactionRepo.getAll();
  return items.map(t => ({
    ...t,
    category: t.category || { id: 'uncategorized', name: 'Others', type: t.type || 'expense', updatedAt: 0 },
  }));
};

export const saveTransaction = async (t: Transaction) => {
  const withTimestamp = { ...t, updatedAt: nowTimestamp() };
  if ((withTimestamp as any).note === undefined) (withTimestamp as any).note = null;
  if ((withTimestamp as any).receiptUrl === undefined) (withTimestamp as any).receiptUrl = null;
  await transactionRepo.upsert(withTimestamp);
};

export const saveTransactionsBulk = async (transactions: Transaction[]) => {
  const sanitized = transactions.map(t => {
    const withTimestamp = { ...t, updatedAt: t.updatedAt || nowTimestamp() };
    if ((withTimestamp as any).note === undefined) (withTimestamp as any).note = null;
    if ((withTimestamp as any).receiptUrl === undefined) (withTimestamp as any).receiptUrl = null;
    return withTimestamp;
  });
  await transactionRepo.upsertBulk(sanitized);
};

export const deleteTransactionLocal = async (id: string) => {
  await transactionRepo.deleteById(id);
};

export const updateTransactionLocal = async (id: string, updates: Partial<Transaction>) => {
  const item = await transactionRepo.getById(id);
  if (item) {
    await transactionRepo.upsert({ ...item, ...updates } as Transaction);
  }
};

// --- Agendas CRUD ---

export const getAgendas = async (): Promise<Agenda[]> => {
  return agendaRepo.getAll();
};

export const saveAgenda = async (agenda: Agenda) => {
  await agendaRepo.upsert(agenda);
};

export const saveAgendasBulk = async (agendas: Agenda[]) => {
  await agendaRepo.upsertBulk(agendas);
};

export const deleteAgendaLocal = async (id: string) => {
  await agendaRepo.deleteById(id);
};

export const updateAgendaLocal = async (id: string, updates: Partial<Agenda>) => {
  const item = await agendaRepo.getById(id);
  if (item) {
    await agendaRepo.upsert({ ...item, ...updates } as Agenda);
  }
};

// --- Subscriptions CRUD ---

export const getSubscriptions = async (): Promise<Subscription[]> => {
  return subscriptionRepo.getAll();
};

export const saveSubscription = async (sub: Subscription) => {
  await subscriptionRepo.upsert(sub);
};

export const saveSubscriptionsBulk = async (subscriptions: Subscription[]) => {
  await subscriptionRepo.upsertBulk(subscriptions);
};

export const deleteSubscriptionLocal = async (id: string) => {
  await subscriptionRepo.deleteById(id);
};

export const updateSubscriptionLocal = async (id: string, updates: Partial<Subscription>) => {
  const item = await subscriptionRepo.getById(id);
  if (item) {
    await subscriptionRepo.upsert({ ...item, ...updates } as Subscription);
  }
};

// --- Dues CRUD ---

export const getDues = async (): Promise<Due[]> => {
  const items = await dueRepo.getAll();

  // Migration: convert old Agenda format to Due
  const migrated = items.map((item: any) => {
    if (item.isRecurring !== undefined && item.frequency === undefined) {
      return {
        id: item.id,
        title: item.title,
        amount: item.amount || 0,
        date: item.date,
        frequency: item.isRecurring ? "monthly" : "once",
        type: item.type || "expense",
        categoryId: item.categoryId,
        autoProcess: false,
        completed: item.completed || false,
        updatedAt: nowTimestamp(),
      } as Due;
    }
    return item as Due;
  });

  return migrated;
};

export const saveDue = async (due: Due) => {
  await dueRepo.upsert(due);
};

export const saveDuesBulk = async (dues: Due[]) => {
  await dueRepo.upsertBulk(dues);
};

export const deleteDueLocal = async (id: string) => {
  await dueRepo.deleteById(id);
};

export const updateDueLocal = async (id: string, updates: Partial<Due>) => {
  const item = await dueRepo.getById(id);
  if (item) {
    await dueRepo.upsert({ ...item, ...updates } as Due);
  }
};

// --- Savings Items CRUD ---

export const getSavingsItems = async (): Promise<SavingsItem[]> => {
  const items = await savingsItemRepo.getAll();

  // Migration: convert old SavingsGoal format to SavingsItem
  const migrated = items.map((item: any) => {
    if (item.targetAmount !== undefined && item.balance === undefined) {
      return {
        id: item.id,
        title: item.title,
        balance: item.currentAmount || 0,
        icon: item.icon,
        color: item.color,
        updatedAt: nowTimestamp(),
      } as SavingsItem;
    }
    return item as SavingsItem;
  });

  // Title-based dedup (title is the display key for savings goals)
  const seen = new Set();
  return migrated.filter((g: SavingsItem) => {
    const key = g.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const saveSavingsItem = async (item: SavingsItem) => {
  await savingsItemRepo.upsert(item);
};

export const saveSavingsItemsBulk = async (items: SavingsItem[]) => {
  await savingsItemRepo.upsertBulk(items);
};

export const deleteSavingsItemLocal = async (id: string) => {
  await savingsItemRepo.deleteById(id);
};

export const updateSavingsItemLocal = async (id: string, updates: Partial<SavingsItem>) => {
  const item = await savingsItemRepo.getById(id);
  if (item) {
    await savingsItemRepo.upsert({ ...item, ...updates } as SavingsItem);
  }
};

// --- Master Users (Auth) ---

export const getUsers = async () => {
  return await getItem<any[]>('master_users', []);
};

export const addUser = async (id: string, name: string, passcode: string) => {
  const users = await getUsers();
  const existingUser = users.find(u => u.id === id);
  if (!existingUser) {
    const hashedPasscode = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      passcode
    );
    
    users.push({ id, name, passcode: hashedPasscode });
    await setItem('master_users', users);
  }
};

export const deleteUser = async (id: string) => {
  const users = await getUsers();
  const filtered = users.filter(u => u.id !== id);
  await setItem('master_users', filtered);

  // Cleanup user-specific data
  const keys = await AsyncStorage.getAllKeys();
  const userKeys = keys.filter(k => k.startsWith(`user_${id}_`));
  await AsyncStorage.multiRemove(userKeys);
};

export const hardResetLocalData = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const keysToWipe = keys.filter(k => k !== 'system_reset_epoch');
  await AsyncStorage.multiRemove(keysToWipe);
};

// --- Import / Export ---

export const exportData = async () => {
  const profile = await getUserProfile();
  const settingsFullKey = await getPrefixedKey('settings');
  const settings = await getItem(settingsFullKey, {});
  const categories = await getCategories();
  const rawTransactions = await getTransactions();
  const dues = await getDues();
  const savingsItems = await getSavingsItems();
  const subscriptions = await getSubscriptions();
  const agendas = await getAgendas();
  const paymentMethods = await getPaymentMethods();

  // Enhance transactions with Base64 images for self-contained backup
  const transactions = await Promise.all(rawTransactions.map(async (t) => {
    if (t.receiptUrl && (t.receiptUrl.startsWith('http') || t.receiptUrl.startsWith('file'))) {
      try {
        const base64 = await FileSystem.readAsStringAsync(t.receiptUrl, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { ...t, receiptBase64: base64 };
      } catch (e) {
        console.warn(`Could not embed image for transaction ${t.id}:`, e);
      }
    }
    return t;
  }));

  return JSON.stringify({
    profile,
    settings,
    categories,
    transactions,
    dues,
    savingsItems,
    subscriptions,
    agendas,
    paymentMethods,
  });
};

export const importData = async (jsonString: string) => {
  const data = JSON.parse(jsonString);
  await clearAllLocalData();

  if (data.profile) {
    await saveUserProfile(data.profile);
  }
  if (data.settings) {
    const settingsFullKey = await getPrefixedKey('settings');
    await setItem(settingsFullKey, data.settings);
  }
  if (data.categories) {
    const categoriesFullKey = await getPrefixedKey('categories');
    await setItem(categoriesFullKey, data.categories);
  }
  if (data.transactions) {
    // Restore images from Base64
    const restoredTransactions = await Promise.all(data.transactions.map(async (t: any) => {
      if (t.receiptBase64) {
        try {
          const filename = `receipt_${t.id}.jpg`;
          const localUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(localUri, t.receiptBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const updated = { ...t, receiptUrl: localUri };
          delete updated.receiptBase64;
          return updated;
        } catch (e) {
          console.error("Failed to restore image during import:", e);
        }
      }
      return t;
    }));

    const transactionsFullKey = await getPrefixedKey('transactions');
    await setItem(transactionsFullKey, restoredTransactions);
  }
  if (data.dues) {
    const duesFullKey = await getPrefixedKey('dues');
    await setItem(duesFullKey, data.dues);
  }
  if (data.savingsItems) {
    const savingsFullKey = await getPrefixedKey('savingsItems');
    await setItem(savingsFullKey, data.savingsItems);
  }
  if (data.subscriptions) {
    const subscriptionsFullKey = await getPrefixedKey('subscriptions');
    await setItem(subscriptionsFullKey, data.subscriptions);
  }
  if (data.agendas) {
    const agendasFullKey = await getPrefixedKey('agendas');
    await setItem(agendasFullKey, data.agendas);
  }
  if (data.paymentMethods) {
    const paymentMethodsFullKey = await getPrefixedKey('paymentMethods');
    await setItem(paymentMethodsFullKey, data.paymentMethods);
  }
};
