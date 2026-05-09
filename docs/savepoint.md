# WiseWallet — Savepoint

> Current architecture & key decisions as of the latest session.

---

## 1. Project Overview

Two-repo codebase:

| Repo | Path | Tech |
|------|------|------|
| **wallet** (frontend) | `D:\hobby\wallet` | Expo SDK 54, React Native 0.81, React Native Paper 5, TypeScript strict |
| **wallet-api** (backend) | `D:\hobby\wallet-api` | Express 5, Supabase (PostgreSQL), JWT, Zod 4 |

**Backend URL (prod):** `https://wallet-api-xi-plum.vercel.app/api`  
**Backend URL (local):** `http://localhost:3000` (via `json-server --watch db.json`)  
**Dev commands:** `npm start` (frontend), `npm run server` (mock API), `npm run dev` (real API local)

---

## 2. Frontend — Provider Hierarchy & Routing

### Provider Nesting (outermost → innermost)

```
DbRecoveryProvider          ← self-healing on fatal AsyncStorage errors
  AuthProvider              ← activeUserId, token (JWT / offline_token / local_token)
    UserProfileProvider     ← name, isFirstRun, currency, darkMode, autoBackup
      SystemResetManager    ← polls GET /system/health, wipes data if epoch changed
      ThemeProvider         ← custom MD3 light/dark themes
        LanguageProvider    ← en / tl translations via t(key)
          PasscodeProvider  ← 4-digit app lock (in-memory only, default "1234")
            CurrencyProvider ← PHP / USD formatting
              AuthLoader    ← initDb(activeUserId), shows loading while initializing
                CategoriesProvider ← categories with cloud sync
                  TransactionsProvider ← transactions with cloud sync
                    MainLayout ← Stack navigator + auth navigation guard
```

### Navigation Guard (in `MainLayout`, fires on mount + dependency change)

```js
if (!activeUserId && !inAuthGroup)         → redirect to /auth
if (activeUserId && isFirstRun && !inOnboarding) → redirect to /onboarding
if (activeUserId && !isFirstRun && (inAuthGroup || inOnboarding)) → redirect to /
```

**Critical:** If `UserProfileProvider.isLoading` is stuck `true`, the guard never fires. Fixed by setting `isLoading = false` when `activeUserId` is null (`context/UserProfileContext.tsx:44`).

### File-Based Routes

```
app/
  _layout.tsx               ← Root stack (provider hierarchy + guard)
  auth.tsx                  ← Login / Register (email + PIN)
  onboarding.tsx            ← First-run: name + initial balance
  passcode-screen.tsx       ← 4-digit numeric lock
  budgets.tsx, calendar.tsx, agenda.tsx, subscriptions.tsx, savings.tsx
  add-transaction.tsx, edit-transaction.tsx, transaction-details.tsx
  payment-methods.tsx, category-settings.tsx, learning-detail.tsx
  help.tsx                         ← Balance FAQ/help screen
  (tabs)/
    _layout.tsx             ← 4-tab navigator
    index.tsx               ← Dashboard
    reports.tsx             ← Charts + export
    learning.tsx            ← Tips hub
    settings.tsx            ← All settings + data mgmt
```

---

## 3. Frontend — Auth System

### AuthContext (`context/AuthContext.tsx`)

| State | AsyncStorage key |
|-------|-----------------|
| `activeUserId` | `activeUserId` |
| `token` | `authToken` |

Three token types:
- **JWT string** — online account, returned by `POST /auth/login` or `/auth/register`
- **`"offline_token"`** — local-only registration (cloud unreachable), `autoBackup: false`
- **`"local_token"`** — local fallback login (offline, compares SHA-256 of passcode)

### Auth Screen Flow (`app/auth.tsx`)

- **API_URL guard:** If `API_URL` is falsy (`.env` missing), skip all online attempts — go straight to local-only mode
- **Login:** `if (!API_URL)` → `attemptLocalLogin()` (SHA-256 passcode match against local users table). Otherwise `POST /auth/login` → handles `sessionConflict` (multi-device force prompt) → catch network error → fallback to `attemptLocalLogin()`
- **Register:** `if (!API_URL)` → create local-only account (UUID, `autoBackup: false`). Otherwise `POST /auth/register` → on network error, offers offline fallback (UUID, saves locally, `autoBackup: false`)
- **Offline detection:** 3s timeout HEAD request to `${API_URL}/paymentMethods` (skipped if no `API_URL`)

---

## 4. Frontend — Data Layer (Offline-First)

### AsyncStorage Key Pattern

```
user_{activeUserId}_{entity}    → all user data
default_{entity}                → fallback when no activeUserId
```@

Entities: `profile`, `settings`, `transactions`, `categories`, `dues`, `savingsItems`, `paymentMethods`

### `authFetch` Wrapper (`utils/apiClient.ts`)

- Reads `authToken` from AsyncStorage
- Attaches `Authorization: Bearer {token}`
- Auto-unwraps API responses:
  - `{ status: "success", data: { dues: [...] } }` → returns `[...]`
  - `{ status: "success", data: { name: "..." } }` → returns `{ name: "..." }`
- Does NOT throw on HTTP errors (returns `Response` directly — caller must check `.ok`)
- **Updated (2026-05-09):** Automatic 401 handling — if backend returns 401, clears `authToken` and `activeUserId` from AsyncStorage, and triggers registered logout callback via `setAuthFailureCallback()` (registered by `AuthContext` to reset React state)

### Sync Pattern per Entity

Each entity follows one of two patterns:

**Pattern A — Individual CRUD sync (categories, dues, savingsItems):**
1. Save/update/delete locally in AsyncStorage
2. Fire-and-forget API call (`.catch()` only catches network errors)
3. No response handling for HTTP errors (fixed: now logs failures)

**Pattern B — Batch sync (transactions):**
- `syncWithServer()` sends full array to `POST /transactions/sync`
- Server upserts, returns authoritative list
- Frontend merges (remote overrides same ID, keeps local-only items)

### Merge Strategies

| Entity | Merge | Authoritative | Dedup |
|--------|-------|---------------|-------|
| Transactions | ID-map | Remote overrides same ID, local items kept | By ID |
| Categories | ID-map | Remote (API fetch replaces local) | By ID |
| Dues | ID-map | Local first, remote merged | Strict by ID |
| Savings Items | ID-map + logical | Remote first, local-only pushed | ID + title (lowercased) |

**Removed (2026-05-09):** Budgets and Subscriptions have been removed from the application entirely. Agendas renamed to Dues. SavingsGoals renamed to SavingsItems.

**UI Terminology Update (2026-05-09):**
- "Dues" (internal DB: `dues`) → displayed as **"Scheduled"** in UI
- "Savings" (internal DB: `savingsItems`) → displayed as **"Allocations"** in UI
- Database layer (`useDues`, `useSavings`, API endpoints, storage keys) remains unchanged — only UI labels updated

---

## 5. Frontend — Clear Data Flow

### `handleClearData` in `app/(tabs)/settings.tsx`

1. **Prompt:** User enters PIN (default `"1234"` or stored passcode)
2. **Fetch cloud:** GET all entities (`transactions`, `categories`, `dues`, `savingsItems`) with `?userId={activeUserId}`
3. **Delete cloud:** DELETE each item by its server-returned ID
4. **Clear local:** `clearAllLocalData()` — removes all `user_{userId}_*` keys EXCEPT `_profile` and `_settings`
5. **Reset profile:** `resetProfileToDefaults()` — preserves name, sets `isFirstRun: false`
6. **Refresh UI:** `refetchTx()`, `refetchCats()`, `refetchDues()`, `refetchSavings()`, `refetchProfile()`
7. Redirect to `/`

### `clearAllLocalData` (`utils/db.ts`)

```js
const userId = await AsyncStorage.getItem('activeUserId');
const prefix = userId ? `user_${userId}_` : `default_`;
const keys = await AsyncStorage.getAllKeys();
const userKeys = keys.filter(k =>
  k.startsWith(prefix) &&
  !k.endsWith('_profile') &&
  !k.endsWith('_settings')
);
await AsyncStorage.multiRemove(userKeys);
```

**Known fix applied:** `refetchBudgets()` was missing from the refresh call (budgets have since been removed).

### `hardResetLocalData` (separate, called during system reset)

Wipes ALL AsyncStorage keys except `system_reset_epoch`. Used when server `reset_epoch` increments (forces all clients to factory reset).

---

## 6. Backend — API Architecture

### Pattern: Route → Controller → Service → Repository

```
dueRoutes.js  →  dueController.js  →  dueService.js  →  dueRepository.js
```

All routes use common middleware:

| Middleware | File | Purpose |
|-----------|------|---------|
| `protect` | `middlewares/protect.js` | Verifies JWT from `Authorization: Bearer`. Sets `req.user`. Throws 401 if invalid/expired. |
| `validate(schema)` | `middlewares/validate.js` | Calls `schema.parse(req.body)`. Zod strips unknown fields by default. Throws 400 on validation error. |

### Standard Response Format

```json
{
  "status": "success",
  "results": 10,
  "data": {
    "dues": [ ... ]
  }
}
```

Error responses propagate through `next(error)` and are caught by a global `AppError` handler (statusCode + isOperational flag).

### Route Files Summary

| Routes File | Prefix | Auth | Special Endpoints |
|------------|--------|------|-------------------|
| `authRoutes` | — | Mixed | POST `/register`, `/login` (public); DELETE `/account` (protected) |
| `transactionRoutes` | — | All protected | POST `/sync` (batch upsert) |
| `dueRoutes` | `/api/dues` | All protected | Standard CRUD |
| `savingsItemRoutes` | `/api/savingsItems` | All protected | Standard CRUD |
| `categoryRoutes` | — | GET public, POST/PUT/DELETE protected | — |
| `profileRoutes` | — | All protected | GET/PUT by userId |
| `storageRoutes` | — | All protected | POST `/upload` (Base64 → Supabase Storage) |
| `systemRoutes` | — | Public | GET `/health`, POST `/reset` |
| `paymentMethodRoutes` | — | Public | GET `/` |

---

## 7. Backend — Schema Validation

### Zod Schemas (all in `src/schemas/`)

| Schema File | Create Fields | Notes |
|------------|--------------|-------|
| `transactionSchema` | `amount`, `date`, `type`, `categoryId` + optional fields | No `id` in schema, but the `/sync` endpoint handles this differently |
| `categorySchema` | `name`, `type`, `icon?` | — |
| `dueSchema` | `title`, `amount` (required), `date`, `frequency?`, `type`, `categoryId?`, `autoProcess?`, `completed?`, `id?` | Replaces `agendaSchema`. Amount is now required. Added `frequency`, `type`, `categoryId`, `autoProcess`. |
| `savingsItemSchema` | `title`, `balance` (default 0), `icon?`, `color?`, `id?` | Replaces `savingsGoalSchema`. Uses `balance` instead of `targetAmount`/`currentAmount`. No `categoryId`. |
| `userSchema` | `name` (email), `passcode` (4-digit), optional `initialBalance` | — |

**Critical behavior:** Zod's `z.object().parse()` strips unknown fields by default. This means any field not declared in the schema is silently removed from `req.body`. This was the root cause of the budget ID mismatch bug — the frontend sent `{ id, amount, month, categoryId, userId }`, but the schema only declared `{ amount, month, categoryId }`, so `id` was dropped, Supabase auto-generated a new ID, and subsequent deletes by the frontend ID returned 404.

---

## 8. Backend — Auth Service

### Registration (`authService.register`)

1. Check `userRepository.findByName(name)` — throw 400 if exists
2. Hash passcode with `bcrypt.genSalt(10)` + `bcrypt.hash`
3. Generate session UUID
4. Create user in Supabase `users` table
5. Create profile in `profiles` table (isFirstRun: true)
6. Sign JWT (24h expiry, secret from `JWT_SECRET` env or fallback)
7. Return `{ user: { id, name }, token }`

### Login (`authService.login`)

1. Find user by name — 401 if not found
2. Compare passcode with bcrypt — 401 if mismatch
3. Session conflict check: if `deviceId !== currentSessionId && !force` → return `{ sessionConflict: true }`
4. Update session ID, sign JWT, return `{ user, token }`

### Account Deletion

`DELETE /auth/account` → `authService.deleteAccount(userId)` → `userRepository.deleteUser(userId)` → Supabase CASCADE deletes all related records (transactions, budgets, profiles, etc.)

---

## 9. Backend — Storage & System

### Receipt Upload (`POST /storage/upload`)

- Body: `{ path, fileBase64, bucket }` (default bucket: `receipts`)
- Path must start with `{userId}/` (enforced on server — prevents cross-user access)
- Converts Base64 → Buffer, uploads via `supabase.storage.from(bucket).upload(path, buffer, { upsert: true })`
- Returns public URL via `supabase.storage.getPublicUrl()`

### System Reset (`GET /system/health`, `POST /system/reset`)

- `health` returns current `reset_epoch` from `systemSettings` table (defaults to 1)
- `reset` increments epoch — frontend detects change on next health check and runs `hardResetLocalData()` (wipes all AsyncStorage except `system_reset_epoch`)

---

## 10. Database — Supabase Schema

### Tables

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `users` | `id` (UUID), `name` (unique), `passcode` (bcrypt), `currentSessionId` | FK parent for all user data |
| `profiles` | `userId` (FK → users), `name`, `isFirstRun`, `currency`, etc. | — |
| `transactions` | `id`, `userId`, `amount`, `categoryId`, `date`, `type`, `dueId`, `savingsItemId`, ... | CASCADE on user delete. `dueId` FK → dues, `savingsItemId` FK → savingsItems |
| `categories` | `id`, `name`, `type`, `isGlobal`, `userId` | Global categories shared, user categories private |
| `dues` | `id`, `userId`, `title`, `amount` (required), `date`, `frequency?`, `type`, `categoryId?`, `autoProcess?`, `completed?`, `savingsItemId?` | Replaces `agendas`. Amount is now NOT NULL. Added `frequency`, `type`, `categoryId`, `autoProcess` columns. |
| `savingsItems` | `id`, `userId`, `title`, `balance` (default 0), `icon?`, `color?` | Replaces `savingsGoals`. Uses `balance` instead of `targetAmount`/`currentAmount`. |
| `paymentMethods` | Static list (seeded globally) | — |
| `systemSettings` | `id`, `reset_epoch` | Single row for system-level config |

**Deleted tables (2026-05-09):** `budgets`, `subscriptions`, `agendas`, `savingsGoals`

### Seed Data

Globals seeded on app init (if `last_seed_version < CURRENT_SEED_VERSION`):
- **9 categories** (Food, Bills, Transport, Shopping, Entertainment, Others as expense; Salary, Freelance, Others as income)
- **6 payment methods** (Cash, BPI Debit, UnionBank, GCash, Maya, Visa Card)

---

## 11. Data Flow Diagrams

### Due Lifecycle (example — offline-first pattern)

```
CREATE:
  User fills title + amount + date + type
    → generateUUID()
    → saveDue(due) to AsyncStorage
    → authFetch POST /api/dues { id, title, amount, date, frequency?, type, categoryId?, autoProcess? }
      → backend validates (Zod), accepts due schema
      → backend creates in Supabase with same ID
    → response ignored (fire-and-forget)

DELETE:
  User taps delete icon
    → deleteDueLocal(id) from AsyncStorage
    → setDues(filtered)   // React state
    → authFetch DELETE /api/dues/{id}
      → backend finds due by id + userId
      → backend deletes from Supabase
    → response checked

FETCH (on page focus):
  → getDues() from AsyncStorage → set UI immediately
  → if autoBackup on:
      authFetch GET /api/dues
      → merge with local (local-first, remote merged by ID)
      → saveDuesBulk(merged) to AsyncStorage
      → setDues(merged)
```

### Balance Correlation

```
totalBalance   = initialBalance + sum(income) - sum(expense)
reserved       = totalAllocated
availableBalance = totalBalance - reserved

totalAllocated = Σ(item.balance) for all allocations (savingsItems in DB)

Allocation transfer-in:
  → creates expense transaction (lowers totalBalance)
  → increases item.balance (raises totalAllocated)
  → net: availableBalance drops by 2× amount (intentional double-counting for psychological effect)
```

**UI vs DB terminology:**
- UI: "Allocations" | DB: `savingsItems`
- UI: "Scheduled" | DB: `dues`

### Clear Data Lifecycle

```
User enters PIN → confirm
  → GET /api/{entities}?userId=X for all entity types (transactions, categories, dues, savingsItems)
  → DELETE /api/{entity}/{id} for every item
  → clearAllLocalData()            // AsyncStorage wipe (keeps profile + settings)
  → resetProfileToDefaults()       // isFirstRun: false, other defaults
  → refetchTx(), refetchCats(), refetchDues(), refetchSavings(), refetchProfile()
  → router.replace("/")
```

---

## 12. Backend Migration: Budget/Subscription Removal, Agenda→Due, SavingsGoal→SavingsItem (2026-05-09)

### What Changed

| Old | New | Action |
|-----|-----|--------|
| `budgetRoutes/Controller/Service/Repository/Schema` | — | **Deleted entirely** |
| `subscriptionRoutes/Controller/Service/Repository/Schema` | — | **Deleted entirely** |
| `agendaRoutes/Controller/Service/Repository/Schema` | `dueRoutes/Controller/Service/Repository/Schema` | **Renamed**, schema updated |
| `savingsGoalRoutes/Controller/Service/Repository/Schema` | `savingsItemRoutes/Controller/Service/Repository/Schema` | **Renamed**, schema updated |

### Updated Due Schema

```typescript
interface Due {
  id: string;
  title: string;
  amount: number;           // now required (was optional in Agenda)
  date: string;
  frequency?: "once" | "weekly" | "biweekly" | "monthly" | "yearly"; // new
  type: "income" | "expense";                                         // new
  categoryId?: string;       // new
  autoProcess?: boolean;     // new
  completed?: boolean;
}
```

### Updated SavingsItem Schema

```typescript
interface SavingsItem {
  id: string;
  title: string;
  balance: number;              // replaces targetAmount + currentAmount
  icon?: string;
  color?: string;
}
```

### SQL Changes

- **Dropped tables:** `budgets`, `subscriptions`
- **Renamed tables:** `agendas` → `dues`, `savingsGoals` → `savingsItems`
- **New columns on `dues`:** `frequency` (enum check), `type` (income/expense), `categoryId` (FK → categories), `autoProcess` (boolean). `amount` changed to NOT NULL.
- **New columns on `transactions`:** `dueId` (FK → dues), `savingsItemId` (FK → savingsItems)
- **New column on `dues`:** `savingsItemId` (FK → savingsItems)
- **Removed from `transactions`:** `budgetId`, `savingsGoalId`
- **Removed from `agendas` (now `dues`):** `budgetId`, `savingsGoalId`
- **Removed columns from `savingsItems`:** `targetAmount`, `currentAmount` (replaced by `balance`)

### API Endpoints

| Old Endpoint | New Endpoint |
|-------------|-------------|
| `GET/POST /api/budgets` | ~~Deleted~~ |
| `GET/PUT/DELETE /api/budgets/:id` | ~~Deleted~~ |
| `GET/POST /api/subscriptions` | ~~Deleted~~ |
| `GET/PUT/DELETE /api/subscriptions/:id` | ~~Deleted~~ |
| `GET/POST /api/agendas` | `GET/POST /api/dues` |
| `GET/PUT/DELETE /api/agendas/:id` | `GET/PUT/DELETE /api/dues/:id` |
| `GET/POST /api/savingsGoals` | `GET/POST /api/savingsItems` |
| `GET/PUT/DELETE /api/savingsGoals/:id` | `GET/PUT/DELETE /api/savingsItems/:id` |

---

## 13. Known Fixes Applied (this session)

### Session: 2026-05-09 (Budget removal + Agenda→Due, SavingsGoal→SavingsItem)

| # | Issue | File | Fix |
|----|-------|------|-----|
| 1 | Navigation guard never fires when `activeUserId` is null | `context/UserProfileContext.tsx:44` | Added `setIsLoading(false)` in the early-return path for null `activeUserId` |
| 2 | "Budget not found" on DELETE because Zod strips `id` | `wallet-api/src/schemas/budgetSchema.js:7` | Added `id: z.string().optional()` to create schema |
| 3 | `deleteBudget` and `addBudget` silently swallow HTTP errors | `hooks/useBudgets.ts:148,197` | Added `.then()` handlers to check `response.ok` |
| 4 | Budgets not cleared in UI after "Clear Data" | `app/(tabs)/settings.tsx:31,194` | Added `useBudgets` import and `refetchBudgets()` to refresh call |
| 5 | Dashboard BudgetCard double-counts transactions | `components/BudgetCard.tsx:17-19` | Aligned with `budgetId`-aware matching from budgets page (explicit link + category fallback) |
| 6 | `budget.categoryId.toString()` crashes when categoryId is undefined | `app/budgets.tsx:75`, `hooks/useInsights.ts:41`, `app/add-transaction.tsx:263`, `app/savings.tsx:87` | Changed to `categoryId?.toString()` with null guard |
| 7 | Budget logical dedup collides when `categoryId` is undefined | `utils/db.ts:237-244` | Changed dedup key from `categoryId+month` to `name+month` |
| 8 | `b.name.toLowerCase()` crashes on remote budgets without `name` (pre-schema data) | `hooks/useBudgets.ts:42,132`, `utils/db.ts:250` | Added `(b.name || '').toLowerCase()` guards; remote data migrated with `name: b.name \|\| 'Others'` before merge |
| 9 | API calls fail with 404 when `.env` missing (`API_URL` = `undefined` → relative URL `"undefined/auth/login"`) | `app/auth.tsx:50,100,186` | Added `if (!API_URL)` guard in `checkConnection`, `handleLogin`, `handleRegister` — skip online attempt, go straight to local-only mode |

### Session: 2026-05-09 (Latest UI fixes + terminology update)

| # | Issue | File | Fix |
|----|-------|------|-----|
| 10 | JSX syntax error: unclosed `<View>` tag | `app/add-transaction.tsx:195` | Removed stray opening View tag with duplicate "Payment Source" label |
| 11 | Import error: `useBudgets` hook doesn't exist | `app/transaction-details.tsx` | Removed incomplete budget/savings linking code (budgets were removed earlier, Transaction type doesn't have `budgetId`/`savingsGoalId`) |
| 12 | 401 "user no longer exists" doesn't auto-logout | `utils/apiClient.ts`, `context/AuthContext.tsx` | Added `setAuthFailureCallback()` registration system; `authFetch` now detects 401, clears AsyncStorage tokens, and triggers React state reset in `AuthContext` |
| 13 | Calendar not opening in dues/Scheduled page | `app/dues.tsx` | Replaced `@react-native-community/datetimepicker` with `react-native-calendars` Modal (same pattern as `add-transaction.tsx`); DateTimePicker had rendering issues inside Modals |
| 14 | Income vs Expense terminology confusing in dues | `app/dues.tsx` | Button "Pay" → "Receive" for income; Alert "DUE" → "RECEIVABLE" for income; confirmation dialogs adjusted by type |
| 15 | Income/Expense toggle not visually obvious | `app/dues.tsx` | Replaced Chips with SegmentedButtons (theme-styled, selected state much clearer) |
| 16 | "Dues" label confusing (implies only expense) | UI only | Renamed UI labels: "Dues" → "Scheduled", "Savings" → "Allocations"; database layer (`dues`, `savingsItems`) unchanged |

---

## 13. Key Files Reference

### Frontend (`wallet/`)

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root provider hierarchy, navigation guard, auth loader |
| `app/auth.tsx` | Login/Register with offline fallback |
| `app/onboarding.tsx` | First-run setup (name + initial balance) |
| `app/(tabs)/settings.tsx` | Clear data, delete account, backup/restore, export/import, Help link |
| `app/help.tsx` | FAQ/help screen explaining balance, dues, savings |
| `context/AuthContext.tsx` | activeUserId + token management |
| `context/UserProfileContext.tsx` | Profile CRUD with cloud merge |
| `context/TransactionsContext.tsx` | Batch sync pattern (model for all entities) |
| `hooks/useDues.ts` | Local-first CRUD with API sync |
| `hooks/useSavings.ts` | Local-first CRUD with API sync |
| `hooks/useInsights.ts` | Savings/dues insights with null-safe category matching |
| `utils/db.ts` | AsyncStorage layer — all CRUD functions, key patterns, seed data |
| `utils/apiClient.ts` | `authFetch` — JWT injection, response unwrapping |
| `types/index.ts` | All TypeScript interfaces (`Due`, `SavingsItem`, etc.) |
| `components/BalanceBreakdown.tsx` | Modal showing detailed balance math (total, reserved, available with line items) |
| `components/SummaryCard.tsx` | Dashboard balance card with tap-to-open BalanceBreakdown |

### Backend (`wallet-api/`)

| File | Purpose |
|------|---------|
| `src/app.js` | Express app setup (CORS, JSON parsing, error handler) |
| `src/middlewares/protect.js` | JWT verification, sets `req.user` |
| `src/middlewares/validate.js` | Zod `schema.parse(req.body)` — strips unknown fields |
| `src/utils/AppError.js` | Custom error class with statusCode + isOperational |
| `src/services/dueService.js` | Due CRUD with upsert-on-update |
| `src/services/savingsItemService.js` | Savings item CRUD |
| `src/services/authService.js` | Registration, login, session conflict, account deletion |
| `src/services/transactionService.js` | Sync (batch upsert), CRUD |
| `src/repositories/dueRepository.js` | Supabase queries for dues table |
| `src/repositories/savingsItemRepository.js` | Supabase queries for savingsItems table |
| `src/schemas/dueSchema.js` | Zod validation for due (amount required, frequency, autoProcess) |
| `src/schemas/savingsItemSchema.js` | Zod validation for savings item (balance instead of targetAmount) |
| `src/routes/transactionRoutes.js` | Includes `POST /sync` batch endpoint |
| `src/config/supabaseClient.js` | Supabase client initialization (env vars) |
| `supabase_schema.sql` | Full SQL schema for all tables |
| `vercel.json` | Vercel serverless deployment config |
| `index.js` | Local development entry point |
| `api/index.js` | Vercel serverless entry point |

---

## 15. Historical: Budget/Savings Decoupling from Categories (2026-05-09, superseded)

> ⚠️ **Note:** This section is historical. Budgets have been **removed entirely** and `savingsGoals` have been **renamed to `savingsItems`** (with `balance` replacing `targetAmount`/`currentAmount`). See §12 for current state.

Categories belong to **transactions** (they describe the "reason" for an income/expense). Prior to removal, budgets were decoupled from categories with a free-text `name` field.

### Balance Reservation Math (historical)

> ⚠️ See §6 for current terminology: "Savings" (DB: `savingsItems`) is now displayed as **"Allocations"** in the UI, and "reservedSavings" is conceptually "totalAllocated".

```
totalBalance   = initialBalance + income - expense
reserved       = reservedSavings
availableBalance = totalBalance - reserved

reservedSavings = Σ(item.balance) for all savings items
```
