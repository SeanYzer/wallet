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

- **Login:** `POST /auth/login` → handles `sessionConflict` (multi-device force prompt) → fallback to local users table
- **Register:** `POST /auth/register` → on network error, offers offline fallback (generates UUID, saves locally, `autoBackup: false`)
- **Offline detection:** 3s timeout HEAD request to `${API_URL}/paymentMethods`

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
| Budgets | ID-map + logical | Remote first, local-only pushed to API | ID + categoryId+month |
| Categories | ID-map | Remote (API fetch replaces local) | By ID |
| Savings Goals | ID-map + logical | Remote first, local-only pushed | ID + title (lowercased) |
| Agendas | ID-map | Local first, remote merged | Strict by ID |
| Subscriptions | ID-map | Local first, remote merged | By ID |

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
| `budgetSchema` | `amount` (positive number), `month` (YYYY-MM), `categoryId` (nullable string), **`id` (optional string)** | **Fix applied:** `id` added so frontend-generated UUID passes through validation |
| `transactionSchema` | `amount`, `date`, `type`, `categoryId` + optional fields | No `id` in schema, but the `/sync` endpoint handles this differently |
| `categorySchema` | `name`, `type`, `icon?` | — |
| `agendaSchema` | `title`, `date`, optional fields | — |
| `subscriptionSchema` | `name`, `amount`, `dueDate`, `category` | — |
| `savingsGoalSchema` | `title`, `targetAmount`, optional fields | — |
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
| `budgets` | `id`, `userId`, `categoryId`, `month`, `amount` | Unique by userId+categoryId+month enforced in service |
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
  User taps "Save Budget"
    → generateUUID()
    → saveBudget(budget) to AsyncStorage
    → authFetch POST /api/budgets { id, amount, month, categoryId }
      → backend validates (Zod), strips unknowns (fixed: allows id)
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
  → getBudgets() from AsyncStorage → set UI immediately
  → if autoBackup on:
      authFetch GET /api/budgets
      → merge with local (remote authoritative)
      → saveBudgetsBulk(merged) to AsyncStorage
      → setBudgets(merged)
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
|---|-------|------|-----|
| 1 | Navigation guard never fires when `activeUserId` is null | `context/UserProfileContext.tsx:44` | Added `setIsLoading(false)` in the early-return path for null `activeUserId` |
| 2 | "Budget not found" on DELETE because Zod strips `id` | `wallet-api/src/schemas/budgetSchema.js:7` | Added `id: z.string().optional()` to create schema |
| 3 | `deleteBudget` and `addBudget` silently swallow HTTP errors | `hooks/useBudgets.ts:148,197` | Added `.then()` handlers to check `response.ok` |
| 4 | Budgets not cleared in UI after "Clear Data" | `app/(tabs)/settings.tsx:31,194` | Added `useBudgets` import and `refetchBudgets()` to refresh call |

---

## 13. Key Files Reference

### Frontend (`wallet/`)

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root provider hierarchy, navigation guard, auth loader |
| `app/auth.tsx` | Login/Register with offline fallback |
| `app/onboarding.tsx` | First-run setup (name + initial balance) |
| `app/(tabs)/settings.tsx` | Clear data, delete account, backup/restore, export/import |
| `app/budgets.tsx` | Budget UI with progress bars, CRUD modals |
| `context/AuthContext.tsx` | activeUserId + token management |
| `context/UserProfileContext.tsx` | Profile CRUD with cloud merge |
| `context/TransactionsContext.tsx` | Batch sync pattern (model for all entities) |
| `hooks/useBudgets.ts` | Local-first CRUD with API sync |
| `utils/db.ts` | AsyncStorage layer — all CRUD functions, key patterns, seed data |
| `utils/apiClient.ts` | `authFetch` — JWT injection, response unwrapping |
| `types/index.ts` | All TypeScript interfaces |

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
