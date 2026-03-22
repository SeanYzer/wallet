import AsyncStorage from '@react-native-async-storage/async-storage';
import { Category, Transaction } from '../types';

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
   return Promise.resolve();
};

export const initMasterDb = async (): Promise<void> => {
   return Promise.resolve();
};

export const getDb = async () => ({
    // Mock DB object if needed by any legacy calls, but we aim to replace all.
    runAsync: async () => {},
    closeAsync: async () => {},
});

export const setOnFatalError = (cb: () => void) => {
    // No fatal native errors in AsyncStorage normally
};

export const clearAllLocalData = async () => {
  const userId = await AsyncStorage.getItem('activeUserId');
  const prefix = userId ? `user_${userId}_` : `default_`;
  
  const keys = await AsyncStorage.getAllKeys();
  const userKeys = keys.filter(k => k.startsWith(prefix));
  await AsyncStorage.multiRemove(userKeys);
  
  // Re-seed default settings
  await setSetting('autoBackup', 'true');
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
  const fullKey = await getPrefixedKey('profile', overrideUserId);
  const profile = await getItem<any>(fullKey, null);
  if (profile) {
    return {
      ...profile,
      isFirstRun: profile.isFirstRun === true || profile.isFirstRun === 1
    };
  }
  return null;
};

export const saveUserProfile = async (name: string, isFirstRun: boolean, initialBalance: number, overrideUserId?: string) => {
  const fullKey = await getPrefixedKey('profile', overrideUserId);
  await setItem(fullKey, { name, isFirstRun, initialBalance });
};

// --- Categories CRUD ---

export const getCategories = async (): Promise<Category[]> => {
  const fullKey = await getPrefixedKey('categories');
  const items = await getItem<Category[]>(fullKey, []);
  return deduplicate(items);
};

export const saveCategory = async (category: Category) => {
  const fullKey = await getPrefixedKey('categories');
  const items = await getCategories();
  const index = items.findIndex(c => String(c.id) === String(category.id));
  if (index >= 0) {
    items[index] = category;
  } else {
    items.push(category);
  }
  await setItem(fullKey, items);
};

export const saveCategoriesBulk = async (categories: Category[]) => {
  const fullKey = await getPrefixedKey('categories');
  const items = await getCategories();
  
  for (const cat of categories) {
    const index = items.findIndex(c => String(c.id) === String(cat.id));
    if (index >= 0) {
      items[index] = cat;
    } else {
      items.push(cat);
    }
  }
  await setItem(fullKey, items);
};

export const deleteCategoryLocal = async (id: string) => {
  const fullKey = await getPrefixedKey('categories');
  const items = await getCategories();
  const filtered = items.filter(c => String(c.id) !== String(id));
  await setItem(fullKey, filtered);
};

// --- Transactions CRUD ---

export const getTransactions = async (): Promise<Transaction[]> => {
  const fullKey = await getPrefixedKey('transactions');
  const items = await getItem<Transaction[]>(fullKey, []);
  return deduplicate(items);
};

export const saveTransaction = async (t: Transaction) => {
  const fullKey = await getPrefixedKey('transactions');
  const items = await getTransactions();
  const index = items.findIndex(x => String(x.id) === String(t.id));
  
  // Ensure we don't store undefined
  const sanitized = { ...t };
  if (sanitized.note === undefined) sanitized.note = null as any;
  if (sanitized.receiptUrl === undefined) sanitized.receiptUrl = null as any;

  if (index >= 0) {
    items[index] = sanitized;
  } else {
    items.push(sanitized);
  }
  await setItem(fullKey, items);
};

export const saveTransactionsBulk = async (transactions: Transaction[]) => {
  const fullKey = await getPrefixedKey('transactions');
  const items = await getTransactions();
  
  for (const t of transactions) {
     const index = items.findIndex(x => String(x.id) === String(t.id));
     const sanitized = { ...t };
     if (sanitized.note === undefined) sanitized.note = null as any;
     if (sanitized.receiptUrl === undefined) sanitized.receiptUrl = null as any;
     
     if (index >= 0) {
       items[index] = sanitized;
     } else {
       items.push(sanitized);
     }
  }
  await setItem(fullKey, items);
};

export const deleteTransactionLocal = async (id: string) => {
  const fullKey = await getPrefixedKey('transactions');
  const items = await getTransactions();
  const filtered = items.filter(x => String(x.id) !== String(id));
  await setItem(fullKey, filtered);
};

export const updateTransactionLocal = async (id: string, updates: Partial<Transaction>) => {
  const items = await getTransactions();
  const index = items.findIndex(x => String(x.id) === String(id));
  if (index >= 0) {
    items[index] = { ...items[index], ...updates };
    const fullKey = await getPrefixedKey('transactions');
    await setItem(fullKey, items);
  }
};

// --- Master Users (Auth) ---

export const getUsers = async () => {
    return await getItem<any[]>('master_users', []);
};

export const addUser = async (id: string, name: string, passcode: string) => {
    const users = await getUsers();
    users.push({ id, name, passcode });
    await setItem('master_users', users);
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

// --- Import / Export ---

export const exportData = async () => {
    const profile = await getUserProfile();
    const settingsFullKey = await getPrefixedKey('settings');
    const settings = await getItem(settingsFullKey, {});
    const categories = await getCategories();
    const transactions = await getTransactions();

    return JSON.stringify({
        profile,
        settings,
        categories,
        transactions
    });
};

export const importData = async (jsonString: string) => {
    const data = JSON.parse(jsonString);
    await clearAllLocalData();

    if (data.profile) {
        await saveUserProfile(data.profile.name, data.profile.isFirstRun, data.profile.initialBalance);
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
        const transactionsFullKey = await getPrefixedKey('transactions');
        await setItem(transactionsFullKey, data.transactions);
    }
};
