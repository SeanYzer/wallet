# Architecture Refactoring Plan

> Current State Analysis (2026-05-30)
>
> This document outlines the architectural issues with the current WiseWallet codebase and a phased plan to improve testability, maintainability, and storage flexibility.

---

## Current Architecture Overview

```
app/                          ← Expo Router file-based routing
  _layout.tsx                 ← Root stack: 9-level provider nesting
  (tabs)/                     ← Tab layout (Home, Reports, Learning, Settings)
  *.tsx                       ← Modal screens (add-transaction, auth, etc.)
context/                      ← 10 React contexts (state + data + sync mixed)
components/                   ← 10 reusable UI components
hooks/                        ← 6 thin wrappers around contexts
utils/
  db.ts                       ← 701-line monolith: all data access + export + seed
  apiClient.ts                ← authFetch with Response-object mutation
  syncQueue.ts                ← Queue-based sync (used by Pattern A entities)
  syncProcessor.ts            ← Queue processor (used by Pattern A entities)
  exportUtils.ts              ← CSV/PDF export
types/
  index.ts                    ← Entity interfaces
```

### Current Pain Points (Verified from Live Bugs)

| # | Issue | Evidence |
|---|-------|----------|
| 1 | **`t.category` can be `undefined`** — crashes Reports, Learning, export | `TypeError: Cannot read properties of undefined (reading 'name')` |
| 2 | **500 error on `/transactions/sync` silently swallowed** — no visibility | `Failed to load resource: 500 ()` — background sync returns early with no feedback |
| 3 | **701-line `db.ts` monolith** — every entity duplicates same CRUD pattern | 7 entity types × 4 operations = 28 nearly identical functions |
| 4 | ~~**Two competing sync paths**~~ — **Intentional**: local is source of truth, cloud is backup save-point for cross-device. Pattern A (queue, per-op) for metadata entities; Pattern B (bulk `POST /transactions/sync`) for transactions. | See [Sync Architecture Decision](#sync-architecture-decision) |
| 5 | **No test infrastructure** — cannot unit test any screen or context | No Jest, no mocks, no DI |
| 6 | **`authFetch` mutates Response object** — fragile, unpredictable return type | `response.json()` is monkey-patched at runtime |

---

## Core Principles

1. **Repository abstraction** — Storage backend is swappable (AsyncStorage ↔ SQLite ↔ Prisma)
2. **Separation of concerns** — Context = state provider only; data access = repos; sync = engine
3. **Testability first** — Every module must be unit-testable without rendering the full provider tree
4. **Progressive migration** — No big-bang rewrites. Each phase is independently shippable.

---

## Sync Architecture Decision

**Local is primary. Cloud is a backup save-point for cross-device switching.**

This is a deliberate design choice, not an inconsistency:

| Pattern | Used by | Mechanism | Why |
|---------|---------|-----------|-----|
| **A — Queue (per-operation)** | Categories, Dues, Savings, Profile, Subscriptions, Agendas | `enqueueSync()` → `syncProcessor.ts` — each mutation enqueued individually with retry | Lower-priority metadata. Loss tolerable, but nice to have synced. |
| **B — Bulk (batch sync)** | Transactions | `TransactionsContext.syncWithServer()` — all transactions serialized and sent to `POST /transactions/sync` in one shot | Transaction data is the core asset. Bulk upload on app open ensures a complete save-point. |

Both patterns treat local AsyncStorage as the **source of truth**. The API is never read for primary display — it's written to as a backup. The two patterns coexist intentionally:

- **Pattern A** (queue) gives per-operation granularity and retry for entities that change individually (e.g., user edits a category name).
- **Pattern B** (bulk) gives atomic save-points for the full transaction dataset, which is the app's core value.

**No unification needed.** Both patterns are valid for their respective use cases. The refactoring plan focuses on making each pattern independently testable, not merging them.

---

## Phase 1 — Testability Foundation (Current Sprint)

**Goal:** Make the code testable and fix the primary bug-hunting pain point. No behavioral changes — just structural cleanup.

### 1.1 Define Repository Interfaces

**New File:** `types/repositories.ts`

```typescript
export interface Repository<T, TID = string> {
  getAll(): Promise<T[]>;
  getById(id: TID): Promise<T | undefined>;
  upsert(entity: T): Promise<void>;
  upsertBulk(entities: T[]): Promise<void>;
  deleteById(id: TID): Promise<void>;
}

export interface TransactionRepository extends Repository<Transaction> {
  getByDateRange(start: string, end: string): Promise<Transaction[]>;
}

export interface CategoryRepository extends Repository<Category> {
  getByType(type: TransactionType): Promise<Category[]>;
}

// ... etc for Due, SavingsItem, Subscription, Agenda, PaymentMethod
```

**Why:** A single interface means:
- Tests can mock the entire data layer in 2 lines
- Adding SQLite later = write one class per entity
- No more `db.ts` sprawl

### 1.2 Implement AsyncStorage Repositories

**New Directory:** `repositories/`

```
repositories/
  base.storage.ts             ← Generic AsyncStorage CRUD (shared logic)
  transaction.repo.ts         ← TransactionRepository implementation
  category.repo.ts            ← CategoryRepository implementation
  due.repo.ts
  savings-item.repo.ts
  subscription.repo.ts
  agenda.repo.ts
  payment-method.repo.ts
  profile.repo.ts
```

Each repo class will be ~40 lines instead of the current ~80 lines per entity type in `db.ts`. The base class handles the `getPrefixedKey → getItem → mutate → setItem` pattern that currently repeats 28 times.

**Example structure:**

```typescript
// base.storage.ts
export class AsyncStorageRepository<T extends { id: string }> {
  constructor(private storageKey: string) {}

  async getAll(): Promise<T[]> {
    const key = await getPrefixedKey(this.storageKey);
    return getItem<T[]>(key, []);
  }

  async upsert(entity: T): Promise<void> {
    const items = await this.getAll();
    const index = items.findIndex(x => x.id === entity.id);
    if (index >= 0) items[index] = { ...entity, updatedAt: Date.now() };
    else items.push({ ...entity, updatedAt: Date.now() });
    await setItem(await getPrefixedKey(this.storageKey), items);
  }

  // ... bulk, delete, etc.
}
```

### 1.3 Add Dependency Injection Context

**New File:** `context/RepositoryContext.tsx`

```typescript
interface Repositories {
  transactions: TransactionRepository;
  categories: CategoryRepository;
  dues: DueRepository;
  savingsItems: SavingsItemRepository;
  subscriptions: SubscriptionRepository;
  agendas: AgendaRepository;
  paymentMethods: PaymentMethodRepository;
  profiles: ProfileRepository;
}
```

This context provides all repositories to the app. Screens no longer import `db.ts` directly — they pull repos from context. Tests can inject mock repos.

```
// Before (current):
import { getTransactions } from "../../utils/db";
const data = await getTransactions();

// After:
const { transactions: transactionRepo } = useRepositories();
const data = await transactionRepo.getAll();
```

### 1.4 Refactor `authFetch`

**Current problem:** `authFetch` monkey-patches `response.json()` at runtime (lines 44–57). This is fragile — the return type is `Response` but the `.json()` behavior changes based on `response.ok`.

**Fix:** Remove the mutation. Return a clean result type:

```typescript
interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function authFetch<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResult<T>> {
  // ... existing auth logic ...
  try {
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      await clearAuthStorage();
      onAuthFailure?.();
    }
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      data: body?.data ?? body,
      error: !response.ok ? (body?.error ?? `HTTP ${response.status}`) : undefined,
    };
  } catch (e: any) {
    return { ok: false, status: 0, error: e.message };
  }
}
```

**Impact:** Every caller changes from `const res = await authFetch(...); const json = await res.json();` to `const { data, error } = await authFetch(...);`. No more response mutation, no more guessing about `.json()` behavior.

### 1.5 ✅ Add ESLint

**Status:** Done — `eslint.config.js` (ESLint v9 flat config) installed and running.

**Key rules:**

| Rule | Level | Why |
|---|---|---|
| `react-hooks/exhaustive-deps` | error | Catches stale closures — the exact bug pattern in `useFocusEffect` |
| `@typescript-eslint/no-explicit-any` | warn | Flags `acc: any` patterns like the one we fixed |
| `@typescript-eslint/no-unused-vars` | warn | Catches dead imports and unused destructuring |
| `no-console` | warn | Flags `console.log` (allows `warn`/`error`/`info`) |
| `no-debugger` | error | Prevents accidental debugger statements |

**Current baseline:** 202 problems (19 errors, 183 warnings) — all errors are `exhaustive-deps`.

**Commands:** `npm run lint` (check), `npm run lint:fix` (auto-fix).

### 1.6 Write First Test Suite

**New File:** `repositories/__tests__/transaction.repo.test.ts`

```typescript
import { AsyncStorageRepository } from '../base.storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('TransactionRepository', () => {
  it('should return empty array when no transactions exist', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const repo = new TransactionRepository();
    const result = await repo.getAll();
    expect(result).toEqual([]);
  });

  it('should upsert and retrieve a transaction', async () => {
    const tx = { id: '1', amount: 100, /* ... */ };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([]));
    await repo.upsert(tx);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([tx]));
    const all = await repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe(100);
  });
});
```

Also add a component-level test:

```typescript
// components/__tests__/ChartCard.test.tsx
import { render } from '@testing-library/react-native';
import { ChartCard } from '../ChartCard';

it('handles transactions with undefined category gracefully', () => {
  const transactions = [
    { id: '1', amount: 50, type: 'expense', category: undefined },
    { id: '2', amount: 30, type: 'expense', category: { name: 'Food' } },
  ];
  const { queryByText } = render(<ChartCard transactions={transactions as any} />);
  expect(queryByText('Uncategorized')).toBeTruthy();
  expect(queryByText('Food')).toBeTruthy();
});
```

### Phase 1 Delivery Checklist

- [ ] 1.1 `types/repositories.ts` — Repository interfaces defined
- [ ] 1.2 `repositories/` — All entity repos extracted from `db.ts`
- [ ] 1.3 `context/RepositoryContext.tsx` — DI context created
- [ ] 1.4 `utils/apiClient.ts` — Clean result type, no Response mutation
- [x] 1.5 `eslint.config.js` — ESLint configured with safety rules (2026-05-30)
- [ ] 1.6 `repositories/__tests__/` — First test suite passing
- [ ] 1.7 `utils/db.ts` — Deprecated, remaining helpers moved to `utils/storage.ts` (~50 lines)

**Expected outcome:** `db.ts` shrinks from 701 lines → ~50 lines (config helpers only). Every screen uses the repo DI context. Tests can mock a repo in 2 lines. The category-undefined crash gets caught at lint time.

---

## Phase 2 — Repository Extraction (Next Sprint)

**Goal:** Finish what Phase 1 starts — remove all dead code, unify the sync layer.

### 2.1 Extract Remaining Entities

| Entity | Lines in `db.ts` | After repo | Reduction |
|--------|------------------|------------|-----------|
| Due | ~60 | ~40 | -33% |
| SavingsItem | ~60 | ~40 | -33% |
| Subscription | ~50 | ~35 | -30% |
| Agenda | ~50 | ~35 | -30% |
| PaymentMethod | ~30 | ~25 | -17% |

### 2.2 Clean Up `utils/db.ts`

Remove all CRUD functions, export logic, migration helpers. Keep only:
- `API_URL` constant
- `getSetting` / `setSetting`
- `getUserProfile` / `saveUserProfile` (until ProfileRepo exists)
- `clearAllLocalData` / `hardResetLocalData`
- `GLOBAL_CATEGORIES` / `GLOBAL_PAYMENT_METHODS`
- `initDb` / `seedDefaults`

---

## Phase 3 — Local Backend Server (When Needed)

**Goal:** Run a Prisma + SQLite backend locally for development instead of hitting Vercel.

### 3.1 Scaffold Server

```
server/
  prisma/
    schema.prisma           ← Models matching repository interfaces
  src/
    index.ts                ← Express/Fastify entry
    routes/                 ← One router per entity
  package.json
  tsconfig.json
```

### 3.2 Environment-Based API URL

`authFetch` already reads `API_URL` from `process.env.EXPO_PUBLIC_API_URL`. No code changes needed — just set the variable:

```bash
# .env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

### 3.3 run on the same machine? use localtunnel or ngrok.
> During dev, the Expo app (phone/emulator) needs to reach the local server.
> Use `npx localtunnel --port 3000` or `ngrok http 3000` and set the URL in `.env`.

---

## Phase 4 — On-Device SQLite (Optional)

**Goal:** Swap AsyncStorage for `expo-sqlite` for better performance with large datasets.

### 4.1 Implement SQLite Repositories

```typescript
// repositories/sqlite/transaction.repo.ts
export class SqliteTransactionRepository implements TransactionRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<Transaction[]> {
    const rows = await this.db.getAllAsync(
      'SELECT * FROM transactions WHERE user_id = ?',
      [this.userId]
    );
    return rows.map(mapRowToTransaction);
  }

  async upsert(tx: Transaction): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO transactions (id, amount, category_id, ...) VALUES (?, ?, ?, ...)`,
      [tx.id, tx.amount, tx.category?.id, ...]
    );
  }
  // ...
}
```

### 4.2 Swap in DI Context

```typescript
// context/RepositoryContext.tsx
const repos: Repositories = useSqlite
  ? { transactions: new SqliteTransactionRepo(db), ... }
  : { transactions: new AsyncStorageTransactionRepo(), ... };
```

**Impact:** One line change in one file. All app code works unchanged.

---

## Migration Strategy

### Do's
- ✅ Each phase is independently shippable — no partial states
- ✅ Phase 1 fixes real bugs while laying foundation
- ✅ Repository interface is the contract — everything depends on it
- ✅ Tests come before complex refactors

### Don'ts
- ❌ Don't rewrite everything at once (big-bang fails)
- ❌ Don't add SQLite until Phase 1 is stable and tested
- ❌ Don't change behavior while restructuring — Phase 1 is pure structural refactor

---

## Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | 1.1 Repository interfaces | 2h | Foundation — unlocks everything |
| 🔴 P0 | 1.3 DI context | 3h | Makes all code testable |
| 🔴 P0 | 1.6 First test suite | 4h | Catches regressions, proves the pattern |
| 🟡 P1 | 1.2 Extract transaction repo | 3h | Removes 80 lines from `db.ts` |
| 🟡 P1 | 1.4 Refactor authFetch | 2h | Eliminates Response mutation bugs |
| 🟢 P1 | ~~1.5 ESLint setup~~ | ✅ Done | 202 problems found (19 errors, 183 warnings) |
| 🟢 P2 | 2.1 Remaining entity repos | 6h | Complete repository coverage |
| 🟢 P2 | 2.3 Clean up db.ts | 2h | Dead code removal |
| 🟢 P3 | Phase 3–4 (SQLite/Prisma) | Variable | Swappable storage |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **DI mechanism** | React Context (no library) | Already using 10 contexts; one more is zero cost. Avoids framework lock-in. |
| **Repository interface** | Generic `Repository<T>` | Simple, sufficient for CRUD. No need for query builders yet. |
| **Test framework** | Jest + React Native Testing Library | Standard in RN ecosystem. Already available in Expo. |
| **API return type** | `ApiResult<T>` discriminated union | Replaces the fragile Response mutation pattern. |
| **Sync patterns** | Two patterns (intentional) | Local is source of truth; cloud is backup save-point. Pattern A (queue) for metadata entities, Pattern B (bulk) for transaction save-points. See [Sync Architecture Decision](#sync-architecture-decision). |
