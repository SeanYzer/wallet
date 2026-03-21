import * as SQLite from 'expo-sqlite';
import { Category, Transaction } from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let currentDbId: string | null = null;

export const getDb = async (overrideUserId?: string) => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const userId = overrideUserId || await AsyncStorage.getItem('activeUserId');
  const dbName = userId ? `wallet_${userId}.db` : 'wallet.db';
  
  if (dbInstance && currentDbId === dbName) {
    return dbInstance;
  }

  // Ensure old connection is closed if name changed (optional but safer)
  // For now just re-open
  dbInstance = await SQLite.openDatabaseAsync(dbName);
  currentDbId = dbName;
  return dbInstance;
};

let isInitializing = false;
export const initDb = async (overrideUserId?: string): Promise<void> => {
  if (isInitializing) return;
  isInitializing = true;
  
  try {
    const db = await getDb(overrideUserId);
    // Use a simpler exec for critical sections
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        categoryId TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        receiptUrl TEXT,
        type TEXT NOT NULL,
        paymentMethod TEXT,
        establishment TEXT,
        splitInfo TEXT
      );
      
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isFirstRun INTEGER NOT NULL,
        name TEXT NOT NULL,
        initialBalance REAL NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    
    await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['autoBackup', 'true']);
  } catch (error: any) {
    console.error("Critical DB Init Error:", error);
    if (error.message && error.message.includes('NullPointerException')) {
       console.warn("Detected corrupted wallet DB! Wiping...");
       const AsyncStorage = require('@react-native-async-storage/async-storage').default;
       const userId = overrideUserId || await AsyncStorage.getItem('activeUserId');
       const dbName = userId ? `wallet_${userId}.db` : 'wallet.db';
       try {
           await SQLite.deleteDatabaseAsync(dbName);
           // Clear JS cache
           if (currentDbId === dbName) {
               dbInstance = null;
               currentDbId = null;
           }
           isInitializing = false;
           return initDb(overrideUserId); // retry
       } catch (err) {
           console.error("Failed to wipe corrupted wallet db:", err);
       }
    }
    // Even if it fails, allow it to be retried by un-flagging
    throw error;
  } finally {
    isInitializing = false;
  }
};

export const clearAllLocalData = async () => {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM transactions;
    DELETE FROM categories;
    DELETE FROM user_profile;
    DELETE FROM settings;
  `);
  // Re-seed autoBackup default
  await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['autoBackup', 'true']);
};

// --- Settings CRUD ---
export const getSetting = async (key: string): Promise<string | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [key]);
  return row ? row.value : null;
};

export const setSetting = async (key: string, value: string) => {
  const db = await getDb();
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
};

// --- Profile CRUD ---
export const getUserProfile = async (overrideUserId?: string) => {
  const db = await getDb(overrideUserId);
  const profile = await db.getFirstAsync<{ isFirstRun: number; name: string; initialBalance: number }>(`SELECT * FROM user_profile LIMIT 1`);
  if (profile) {
    return {
      isFirstRun: profile.isFirstRun === 1,
      name: profile.name,
      initialBalance: profile.initialBalance
    };
  }
  return null;
};

export const saveUserProfile = async (name: string, isFirstRun: boolean, initialBalance: number, overrideUserId?: string) => {
  const db = await getDb(overrideUserId);
  const existing = await getUserProfile(overrideUserId);
  if (existing) {
    await db.runAsync(`UPDATE user_profile SET name = ?, isFirstRun = ?, initialBalance = ?`, [name, isFirstRun ? 1 : 0, initialBalance]);
  } else {
    await db.runAsync(`INSERT INTO user_profile (name, isFirstRun, initialBalance) VALUES (?, ?, ?)`, [name, isFirstRun ? 1 : 0, initialBalance]);
  }
};

// --- Categories CRUD ---
export const getCategories = async (): Promise<Category[]> => {
  const db = await getDb();
  return await db.getAllAsync<Category>(`SELECT * FROM categories`);
};

export const saveCategory = async (category: Category) => {
  const db = await getDb();
  await db.runAsync(`INSERT OR REPLACE INTO categories (id, name, type) VALUES (?, ?, ?)`, [String(category.id), category.name, category.type]);
};

export const deleteCategoryLocal = async (id: string) => {
  const db = await getDb();
  await db.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
};

// --- Transactions CRUD ---
export const getTransactions = async (): Promise<Transaction[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM transactions`);
  const categories = await getCategories();
  
  return rows.map(r => ({
    id: r.id,
    amount: r.amount,
    categoryId: r.categoryId, // Note: We use categoryId directly instead of the full category object if we modify the type, but let's reconstruct it.
    category: categories.find(c => String(c.id) === String(r.categoryId)) || { id: r.categoryId, name: 'Unknown', type: r.type },
    date: r.date,
    note: r.note,
    receiptUrl: r.receiptUrl,
    type: r.type,
    paymentMethod: r.paymentMethod,
    establishment: r.establishment,
    splitInfo: r.splitInfo ? JSON.parse(r.splitInfo) : undefined
  }));
};

export const saveTransaction = async (t: Transaction) => {
  const db = await getDb();
  const args = [
    t.id ?? null, 
    t.amount ?? null, 
    String(t.category?.id || (t as any).categoryId), 
    t.date ?? null, 
    t.note || null, 
    t.receiptUrl || null, 
    t.type ?? null, 
    t.paymentMethod || null, 
    t.establishment || null, 
    t.splitInfo ? JSON.stringify(t.splitInfo) : null
  ];
  
  if (args.some(v => v === undefined)) {
    console.error("SQLite Binding Error: Undefined value in arguments:", args);
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO transactions (id, amount, categoryId, date, note, receiptUrl, type, paymentMethod, establishment, splitInfo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args
  );
};

export const deleteTransactionLocal = async (id: string) => {
  const db = await getDb();
  await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
};

export const updateTransactionLocal = async (id: string, updates: Partial<Transaction>) => {
  // Simple update logic by fetching existing and re-saving
  const db = await getDb();
  const existingRows = await getTransactions();
  const t = existingRows.find(x => x.id === id);
  if (t) {
    const updated = { ...t, ...updates };
    await saveTransaction(updated);
  }
};

// --- Master DB (Authentication) ---
export const getMasterDb = async () => {
    return await SQLite.openDatabaseAsync('master.db');
};

export const initMasterDb = async (): Promise<void> => {
    try {
        const db = await getMasterDb();
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                passcode TEXT NOT NULL
            );
        `);
    } catch (e: any) {
        if (e.message && e.message.includes('NullPointerException')) {
            console.warn("Detected corrupted master.db! Wiping and recreating...");
            try {
                await SQLite.deleteDatabaseAsync('master.db');
                return initMasterDb(); 
            } catch (err) {
               console.error("Failed to recover master.db", err);
            }
        }
        throw e;
    }
};

export const getUsers = async () => {
    const db = await getMasterDb();
    return await db.getAllAsync<{id: string, name: string, passcode: string}>(`SELECT * FROM users`);
};

export const addUser = async (id: string, name: string, passcode: string) => {
    const db = await getMasterDb();
    await db.runAsync(`INSERT INTO users (id, name, passcode) VALUES (?, ?, ?)`, [id, name, passcode]);
};

export const deleteUser = async (id: string) => {
    const db = await getMasterDb();
    await db.runAsync(`DELETE FROM users WHERE id = ?`, [id]);
    // Note: Deleting the actual database file wallet_${id}.db is more complex in expo-sqlite 
    // as it doesn't expose a direct deleteDatabase function easily without native modules.
    // For now, removing from master is the primary step.
};

// --- Import / Export ---
export const exportData = async () => {
    const profile = await getUserProfile();
    const db = await getDb();
    const settingsRows = await db.getAllAsync<{key:string, value:string}>(`SELECT * FROM settings`);
    const settings = settingsRows.reduce((acc, row) => ({...acc, [row.key]: row.value}), {});
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
    const db = await getDb();
    await clearAllLocalData(); // Clean current tables first

    if (data.profile) {
        await saveUserProfile(data.profile.name, data.profile.isFirstRun, data.profile.initialBalance);
    }
    
    if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
            await setSetting(key, String(value));
        }
    }

    if (data.categories) {
        for (const cat of data.categories) {
            await saveCategory(cat as Category);
        }
    }

    if (data.transactions) {
        for (const t of data.transactions as any[]) {
            const args = [
              t.id ?? null, 
              t.amount ?? null, 
              String(t.category?.id || t.categoryId), 
              t.date ?? null, 
              t.note || null, 
              t.receiptUrl || null, 
              t.type ?? null, 
              t.paymentMethod || null, 
              t.establishment || null, 
              t.splitInfo ? JSON.stringify(t.splitInfo) : null
            ];
            await db.runAsync(
              `INSERT OR REPLACE INTO transactions (id, amount, categoryId, date, note, receiptUrl, type, paymentMethod, establishment, splitInfo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args
            );
        }
    }
};
