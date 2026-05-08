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
```

Entities: `profile`, `settings`, `transactions`, `budgets`, `categories`, `agendas`, `subscriptions`, `savingsGoals`, `paymentMethods`

### `authFetch` Wrapper (`utils/apiClient.ts`)

- Reads `authToken` from AsyncStorage
- Attaches `Authorization: Bearer {token}`
- Auto-unwraps API responses:
  - `{ status: "success", data: { budgets: [...] } }` → returns `[...]`
  - `{ status: "success", data: { name: "..." } }` → returns `{ name: "..." }`
- Does NOT throw on HTTP errors (returns `Response` directly — caller must check `.ok`)

### Sync Pattern per Entity

Each entity follows one of two patterns:

**Pattern A — Individual CRUD sync (budgets, categories, agendas, subscriptions, savingsGoals):**
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
| Budgets | ID-map + logical | Remote first, local-only pushed to API | ID + name+month |
| Categories | ID-map | Remote (API fetch replaces local) | By ID |
| Savings Goals | ID-map + logical | Remote first, local-only pushed | ID + title (lowercased) |
| Agendas | ID-map | Local first, remote merged | Strict by ID |
| Subscriptions | ID-map | Local first, remote merged | By ID |

**Change (2026-05-09):** Budgets dedup key changed from `categoryId+month` to `name+month` to reflect that budgets are now standalone plans with a free-text name, not tied to categories. See §14.

---

## 5. Frontend — Clear Data Flow

### `handleClearData` in `app/(tabs)/settings.tsx`

1. **Prompt:** User enters PIN (default `"1234"` or stored passcode)
2. **Fetch cloud:** GET all entities (`transactions`, `categories`, `budgets`, `agendas`, `subscriptions`, `savingsGoals`) with `?userId={activeUserId}`
3. **Delete cloud:** DELETE each item by its server-returned ID
4. **Clear local:** `clearAllLocalData()` — removes all `user_{userId}_*` keys EXCEPT `_profile` and `_settings`
5. **Reset profile:** `resetProfileToDefaults()` — preserves name, sets `isFirstRun: false`
6. **Refresh UI:** `refetchTx()`, `refetchCats()`, `refetchBudgets()`, `refetchProfile()`
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

**Known fix applied:** `refetchBudgets()` was missing from the refresh call — budgets stayed in React state after AsyncStorage was cleared.

### `hardResetLocalData` (separate, called during system reset)

Wipes ALL AsyncStorage keys except `system_reset_epoch`. Used when server `reset_epoch` increments (forces all clients to factory reset).

---

## 6. Backend — API Architecture

### Pattern: Route → Controller → Service → Repository

```
budgetRoutes.js  →  budgetController.js  →  budgetService.js  →  budgetRepository.js
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
    "budgets": [ ... ]
  }
}
```

Error responses propagate through `next(error)` and are caught by a global `AppError` handler (statusCode + isOperational flag).

### Route Files Summary

| Routes File | Prefix | Auth | Special Endpoints |
|------------|--------|------|-------------------|
| `authRoutes` | — | Mixed | POST `/register`, `/login` (public); DELETE `/account` (protected) |
| `transactionRoutes` | — | All protected | POST `/sync` (batch upsert) |
| `budgetRoutes` | — | All protected | Standard CRUD |
| `categoryRoutes` | — | GET public, POST/PUT/DELETE protected | — |
| `agendaRoutes`, `subscriptionRoutes`, `savingsGoalRoutes` | — | All protected | Standard CRUD |
| `profileRoutes` | — | All protected | GET/PUT by userId |
| `storageRoutes` | — | All protected | POST `/upload` (Base64 → Supabase Storage) |
| `systemRoutes` | — | Public | GET `/health`, POST `/reset` |
| `paymentMethodRoutes` | — | Public | GET `/` |

---

## 7. Backend — Schema Validation

### Zod Schemas (all in `src/schemas/`)

| Schema File | Create Fields | Notes |
|------------|--------------|-------|
| `budgetSchema` | `name` (optional string), `amount` (positive number), `month` (YYYY-MM), `categoryId` (nullable string), **`id` (optional string)** | **`name` added 2026-05-09:** free-text label, budgets no longer require a category; `categoryId` is now purely optional metadata |
| `transactionSchema` | `amount`, `date`, `type`, `categoryId` + optional fields | No `id` in schema, but the `/sync` endpoint handles this differently |
| `categorySchema` | `name`, `type`, `icon?` | — |
| `agendaSchema` | `title`, `date`, optional fields | — |
| `subscriptionSchema` | `name`, `amount`, `dueDate`, `category` | — |
| `savingsGoalSchema` | `title`, `targetAmount`, `categoryId` (nullable string, optional), optional fields | **`categoryId` added 2026-05-09:** optional category reference for deposit transaction categorization |
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
| `transactions` | `id`, `userId`, `amount`, `categoryId`, `date`, `type`, `receiptUrl`, ... | CASCADE on user delete |
| `budgets` | `id`, `userId`, `name`, `categoryId`, `month`, `amount` | Unique by userId+name+month. `categoryId` is nullable (optional metadata). **Changed from categoryId+month to name+month (2026-05-09).** |
| `categories` | `id`, `name`, `type`, `isGlobal`, `userId` | Global categories shared, user categories private |
| `agendas`, `subscriptions`, `savings_goals` | `id`, `userId` + entity-specific fields | CASCADE on user delete |
| `payment_methods` | Static list (seeded globally) | — |
| `system_settings` | `id`, `reset_epoch` | Single row for system-level config |

### Seed Data

Globals seeded on app init (if `last_seed_version < CURRENT_SEED_VERSION`):
- **9 categories** (Food, Bills, Transport, Shopping, Entertainment, Others as expense; Salary, Freelance, Others as income)
- **6 payment methods** (Cash, BPI Debit, UnionBank, GCash, Maya, Visa Card)

---

## 11. Data Flow Diagrams

### Budget Lifecycle (example — offline-first pattern)

```
CREATE:
  User fills name + optional category + amount
    → generateUUID()
    → saveBudget(budget) to AsyncStorage
    → authFetch POST /api/budgets { id, name, amount, month, categoryId? }
      → backend validates (Zod), accepts name + nullable categoryId
      → backend creates in Supabase with same ID
    → response ignored (fire-and-forget)

DELETE:
  User taps delete icon
    → deleteBudgetLocal(id) from AsyncStorage
    → setBudgets(filtered)   // React state
    → authFetch DELETE /api/budgets/{id}
      → backend finds budget by id + userId
      → backend deletes from Supabase
    → response checked (fixed: logs only if non-404 error)

FETCH (on page focus):
  → getBudgets() from AsyncStorage
      → migration: budgets without name get name from category lookup
      → set UI immediately
  → if autoBackup on:
      authFetch GET /api/budgets
      → merge with local (remote authoritative, logical dedup by name+month)
      → saveBudgetsBulk(merged) to AsyncStorage
      → setBudgets(merged)
```

### Balance Correlation

```
totalBalance   = initialBalance + sum(income) - sum(expense)
reserved       = reservedBudgets + reservedSavings
availableBalance = totalBalance - reserved

reservedBudgets = Σ(max(0, budget.amount - spent)) for current-month budgets
  spent = sum of transactions matching:
    - explicit t.budgetId === budget.id, OR
    - (!t.budgetId && t.category === budget.categoryId && same month) — only if budget has a categoryId

reservedSavings = Σ(goal.currentAmount) for all goals

Savings deposit (handleDeposit):
  → creates expense transaction (lowers totalBalance)
  → increases goal.currentAmount (raises reservedSavings)
  → net: availableBalance drops by 2× deposit amount (intentional)
```

### Clear Data Lifecycle

```
User enters PIN → confirm
  → GET /api/{entities}?userId=X for all 6 entity types
  → DELETE /api/{entity}/{id} for every item
  → clearAllLocalData()            // AsyncStorage wipe (keeps profile + settings)
  → resetProfileToDefaults()       // isFirstRun: false, other defaults
  → refetchTx(), refetchCats(), refetchBudgets(), refetchProfile()
  → router.replace("/")
```

---

## 12. Known Fixes Applied (this session)

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

---

## 13. Key Files Reference

### Frontend (`wallet/`)

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root provider hierarchy, navigation guard, auth loader |
| `app/auth.tsx` | Login/Register with offline fallback |
| `app/onboarding.tsx` | First-run setup (name + initial balance) |
| `app/(tabs)/settings.tsx` | Clear data, delete account, backup/restore, export/import, Help link |
| `app/budgets.tsx` | Budget UI with progress bars, CRUD modals (free-text name + optional category) |
| `app/help.tsx` | FAQ/help screen explaining balance, budgets, savings, agendas |
| `context/AuthContext.tsx` | activeUserId + token management |
| `context/UserProfileContext.tsx` | Profile CRUD with cloud merge |
| `context/TransactionsContext.tsx` | Batch sync pattern (model for all entities) |
| `hooks/useBudgets.ts` | Local-first CRUD with API sync (dedup by name+month) |
| `hooks/useInsights.ts` | Budget/savings/agenda insights with null-safe category matching |
| `hooks/useSavings.ts` | Local-first CRUD with API sync (sends categoryId) |
| `utils/db.ts` | AsyncStorage layer — all CRUD functions, key patterns, seed data, budget name migration |
| `utils/apiClient.ts` | `authFetch` — JWT injection, response unwrapping |
| `types/index.ts` | All TypeScript interfaces (`Budget.name`, optional `Budget.categoryId`, optional `SavingsGoal.categoryId`) |
| `components/BalanceBreakdown.tsx` | Modal showing detailed balance math (total, reserved, available with line items) |
| `components/SummaryCard.tsx` | Dashboard balance card with tap-to-open BalanceBreakdown |
| `components/BudgetCard.tsx` | Budget card with `budgetId`-aware spending, shows `budget.name` |

### Backend (`wallet-api/`)

| File | Purpose |
|------|---------|
| `src/app.js` | Express app setup (CORS, JSON parsing, error handler) |
| `src/middlewares/protect.js` | JWT verification, sets `req.user` |
| `src/middlewares/validate.js` | Zod `schema.parse(req.body)` — strips unknown fields |
| `src/utils/AppError.js` | Custom error class with statusCode + isOperational |
| `src/services/budgetService.js` | Business logic: duplicate check, ownership guard |
| `src/services/authService.js` | Registration, login, session conflict, account deletion |
| `src/services/transactionService.js` | Sync (batch upsert), CRUD |
| `src/repositories/budgetRepository.js` | Supabase queries for budgets table |
| `src/schemas/budgetSchema.js` | Zod validation (now includes `id`) |
| `src/routes/transactionRoutes.js` | Includes `POST /sync` batch endpoint |
| `src/config/supabaseClient.js` | Supabase client initialization (env vars) |
| `supabase_schema.sql` | Full SQL schema for all tables |
| `vercel.json` | Vercel serverless deployment config |
| `index.js` | Local development entry point |
| `api/index.js` | Vercel serverless entry point |

---

## 14. Budget/Savings Decoupling from Categories (2026-05-09)

### Design Decision

Categories belong to **transactions** (they describe the "reason" for an income/expense). Budgets and savings goals are **independent plans** with their own free-text names. Category on a budget/savings goal is purely optional metadata — it defaults to `"Others"` for display when absent.

### Data Model

```typescript
// Before (categoryId required — budgets were tied to categories)
interface Budget {
  id: string;
  categoryId: string | number;  // required
  amount: number;
  month: string;
}

// After (budget is a standalone plan, category is optional)
interface Budget {
  id: string;
  name: string;                 // free-text label (REQUIRED)
  categoryId?: string | number;  // optional metadata
  amount: number;
  month: string;
}

// SavingsGoal got the same treatment
interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  categoryId?: string | number;  // NEW — optional metadata
  icon?: string;
  color?: string;
}
```

### Spending Tracking Rule

When `budget.categoryId` is **set**:
1. `t.budgetId === budget.id` → explicit link matches
2. `!t.budgetId && t.category === budget.categoryId && t.month === budget.month` → category fallback matches
3. `t.budgetId && t.budgetId !== budget.id` → excluded (belongs to another budget)

When `budget.categoryId` is **undefined**:
- Only explicit `t.budgetId === budget.id` links count
- No category fallback (since there's no category to match against)

This rule is consistently applied across all 5 spending calculation sites:
- `app/budgets.tsx:64-82` (getBudgetSpending)
- `components/BudgetCard.tsx:17-24`
- `components/SummaryCard.tsx:35-37`
- `hooks/useInsights.ts:35-42`
- `app/savings.tsx:86-88` (transfer from budget)

### Migration

Existing budgets (stored in AsyncStorage without a `name` field) are migrated automatically in `getBudgets()`:
1. Look up `categoryId` in the local categories list
2. If a matching category is found, use its name as the budget name
3. If no category is found (or `categoryId` is null), fall back to `"Others"`
4. The migration runs every time `getBudgets()` is called — it's idempotent (checking `if (!b.name)`)

### Balance Reservation Math

```
totalBalance   = initialBalance + income - expense
reserved       = reservedBudgets + reservedSavings
availableBalance = totalBalance - reserved

reservedBudgets = Σ(max(0, budget.amount - spent))
reservedSavings = Σ(goal.currentAmount)
```

Key behaviors:
- **Creating a budget** → reserves full `budget.amount` from available balance immediately
- **Spending against a budget** → total balance drops, reserved releases dollar-for-dollar → available balance unchanged
- **Depositing to savings** → creates expense (lowers total), increases `currentAmount` (raises reserved) → available drops by 2× (intentional: cash left AND is set aside)
- **Transfer budget → savings** → reallocates without cash movement (total unchanged, reserved budgets ↓, reserved savings ↑) → net zero on available

### UI Changes

| Screen | Change |
|--------|--------|
| `app/budgets.tsx` (create modal) | Name text input + optional category chips + amount |
| `app/budgets.tsx` (list) | Shows `budget.name` with optional category subtitle |
| `app/add-transaction.tsx` | Budget chips show `b.name`; overbudget warning uses `b.name` |
| `app/agenda.tsx` | Budget chips show `b.name`; helper text: *"Linking doesn't deduct from your balance..."* |
| `app/savings.tsx` | Goal creation has optional category chips; deposit uses goal's categoryId for transaction category |
| `components/BudgetCard.tsx` | Shows `budget.name`; spending calc uses `budgetId`-aware matching |
| `components/SummaryCard.tsx` | "Total" / "Reserved" badges tappable → opens BalanceBreakdown modal |
| `components/BalanceBreakdown.tsx` | **New** — modal showing full balance math with line-item details |
| `app/help.tsx` | **New** — FAQ/help screen covering all balance concepts |
| `app/(tabs)/settings.tsx` | Added "Help & FAQ" link at bottom |

### Backend Schema Changes

| Schema | Field Added | Type | Notes |
|--------|-------------|------|-------|
| `budgetSchema.js` | `name` | `z.string().optional()` | Already accepted `categoryId: z.string().nullable().optional()` |
| `savingsGoalSchema.js` | `categoryId` | `z.string().nullable().optional()` | New field |

---

## 15. Setup Requirements & Critical Context

### `.env` File (gitignored — must exist per-machine)

The app requires a `.env` file at the project root with:

```env
EXPO_PUBLIC_API_URL="https://wallet-api-xi-plum.vercel.app/api"
```

Without it, `API_URL` is `undefined` and the app runs in **local-only mode** (all API calls skip the online attempt — see auth.tsx guards in §3). `.env` is gitignored, so it must be manually created after each `git clone`.

### Ports

| Port | Service | Note |
|------|---------|------|
| `8082` | Expo Metro bundler (dev server) | Falls to 8082 when 8081 is busy — NOT the API |
| `3000` | Local mock API (`json-server`) | Optional for local development |

### API URLs

| Environment | URL |
|-------------|-----|
| Production | `https://wallet-api-xi-plum.vercel.app/api` |
| Local mock | `http://localhost:3000` |

---

## 16. Next Steps

1. **`.env` file** — ensure it's present on any new machine after clone
2. **"Link to Cloud" upgrade flow** — allows offline-registered users to link their local account to an existing cloud account with conflict resolution (Keep Local / Keep Cloud)
