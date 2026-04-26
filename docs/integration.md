# Wallet & Wallet-API Integration Plan

This document outlines the architecture principles mapping the React Native frontend (`wallet`) alongside the Supabase-backed API (`wallet-api`), followed by the schema discrepancies and an endpoint implementation checklist.

---

## 1. Core Architecture & Sync Principles (Crucial)

To ensure the product behaves consistently and independently from the network state, the following architectural rules **must** be enforced:

### A. Offline-First Operation
- **Strict Local Execution**: The `wallet` application will **never** render or fetch data *directly* from the online API for user consumption. 
- **Role of the API**: The backend (`wallet-api`) acts *solely* as a backup and cross-device synchronization engine. The frontend only reads from local storage (`AsyncStorage` / local DB).
- **Auto-save via Background Sync**: When the user has "auto-save" enabled, the application will fire off background sync events to the API every time a change or a transaction is made locally. 
- **Toggling Auto-save (OFF to ON)**: 
  - Upon toggling ON, the app checks the API for all personalized data (linked via `userId`).
  - **Warning**: A notification will explicitly warn the user that this action may cause an overwrite.
  - **Dry-Run Comparison**: If the user agrees, the app performs a fetch-and-compare *without* overwriting any local or cloud data yet.
  - **Resolution Prompt**: The user is then forced to resolve the state by choosing to either **Keep Local** or **Keep Cloud**. 
  - **Constraint**: *No cherry-picking*. The decision applies universally across all personalized data for that user. 

### B. First Use & Registration Loophole
- **Initial Network Check**: Upon first run, the app will ping for an active internet connection.
- **Online Preference**: If online, the registration happens against the backend.
- **Offline Fallback**: If offline, the user is still allowed to register and use the app normally (offline registration).
- **Conflict Resolution (The Loophole)**: If a user registered offline and eventually turns on auto-save (or attempts to restore/backup) to a sync server where their account *already exists*, the app must trigger a warning. The user must be prompted to explicitly choose which version of the data to keep (Local vs Remote). We are intentionally allowing this loophole for now, but the resolution prompt needs to be built.

### C. Authentication (Mapping 'Email' to 'name' Column)
- **Account Identification**: We will use **Email Address** for registration/login in the UI.
- **Database Mapping**: To avoid schema noise, we will keep the column name as `name` in the `users` table, but the application will populate it with the user's email.
- **Uniqueness**: 
  - **Online**: The app will check for availability; if an email is already taken, it notifies the user.
  - **Offline**: Users are allowed to register locally. The conflict resolution ("Keep Local" vs "Keep Cloud") will handle identity overlaps when they eventually sync.
- **Validation**: UI-side only (email format validation), no backend verification loop for now.

---

## 2. Data Type & Schema Mismatches (SQL vs Frontend)

### ID Generation (Critical)
- **Supabase**: Primary keys (`id`) across all tables are defined as `UUID` default `gen_random_uuid()`.
- **Frontend**: Currently generates IDs using `Date.now().toString()` (e.g., in `TransactionsContext.tsx`). 
- **Action**: Sending timestamp strings as UUIDs to the `wallet-api` will result in Postgres `uuid invalid` errors. 
- **Fix**: The frontend must switch to generating valid UUIDv4 strings locally so they can be seamlessly synced.

### Transactions
- **Frontend Model**: 
  - `category` is an object (`Category`).
  - `splitInfo` is an object.
- **SQL Schema**: 
  - Expects `categoryId` (UUID) instead of a `category` object. 
  - `splitInfo` does not exist in the database.
- **Fix**: 
  1. The API GET `/api/transactions` should probably perform a `JOIN` to attach the `category` object, OR the frontend needs to be refactored to just use `categoryId` and map it locally.
  2. If `splitInfo` is required, add a `splitInfo JSONB` column to the `transactions` table.

### Agendas
- **Frontend Model**: Has `isRecurring` (boolean).
- **SQL Schema**: Missing `isRecurring`.
- **Fix**: Add `"isRecurring" BOOLEAN DEFAULT FALSE` to the `agendas` table migration.

### Savings Goals
- **Frontend Model**: Has `icon` and `color`.
- **SQL Schema**: Has `color` but is missing `icon`.
- **Fix**: Add `"icon" TEXT` to the `savingsGoals` table migration.

### Date Handling
- **Supabase**: Uses `TIMESTAMPTZ`.
- **Frontend**: Uses ISO strings.
- **Fix**: Standardize on sending full ISO strings from the frontend; Postgres will parse them to `TIMESTAMPTZ` correctly.

---

## 3. Endpoint & Page Itemization Plan

### 1. Authentication & Profiles (`AuthContext`, `UserProfileContext`)
- **API Endpoints**: `/api/auth/login`, `/api/auth/register`, `/api/userProfiles/{id}`
- **Frontend Task**: 
  - Update local Auth definition to require an `Email` instead of `Name`. Verify DB constraint uses `email`.
  - Registration flows must handle the connection check (`navigator.onLine` / NetInfo) and store the account locally if offline, triggering the backend sync only when connection is restored.

### 2. Transactions (`TransactionsContext`)
- **API Endpoints**: `/api/transactions`, `/api/transactions/sync`
- **Payload mapping on sync**: 
  - Fire a sync payload in the background only if Auto-Save is ON.
  - IDs must be pre-formatted as valid UUIDs locally.

### 3. Categories (`CategoriesContext`)
- **API Endpoints**: `/api/categories`
- **Data flow**: App pulls global categories and pushes user custom categories.

### 4. Budgets (`useBudgets.ts`)
- **API Endpoints**: `/api/budgets`
- **Data flow**: Amount is `NUMERIC` in DB. Background sync array of budgets when Auto-save is on.

### 5. Agendas (`useAgenda.ts`)
- **API Endpoints**: `/api/agendas`
- **Action**: Add `isRecurring` to DB before attempting to sync recurrent agendas.

### 6. Subscriptions (`useSubscriptions.ts`)
- **API Endpoints**: `/api/subscriptions`
- **Action**: Ensure `id` is a UUID.

### 7. Savings Goals (`useSavings.ts`)
- **API Endpoints**: `/api/savingsGoals`
- **Action**: Add `icon` to schema. Verify that progress updates (`currentAmount`) correctly hit the sync endpoint seamlessly.

### 8. Payment Methods
- **API Endpoints**: `/api/paymentMethods`
- **Action**: Frontend should GET `/api/paymentMethods` to cache them locally for offline usage, replacing the hardcoded ones.

---

---

## 4. Status & Progress Checklist

### [x] Phase 1: Architecture Core & Schema
- [x] Update `supabase_schema.sql` with `splitInfo` (JSONB), `isRecurring` (Agendas), and `icon` (SavingsGoals).
- [x] Fix Payment Method UI in frontend (case-insensitive chips).
- [x] Refine "Clear All Data" to preserve `userProfiles` and `users` both locally and in cloud.
- [x] Implement Auto-save toggle logic with Conflict Resolution (Keep Local vs Keep Cloud).

### [/] Phase 2: Authentication Refactor
- [ ] Refactor `AuthContext` and `auth.tsx` to use **Email** instead of **Username**.
- [ ] Implement Offline Registration flow using local UUID generation.
- [ ] Add Online Connectivity Check to warn about registration uniqueness.

### [ ] Phase 3: UUID Local Generation
- [ ] Add `uuid` dependency to `wallet`.
- [ ] Update all Contexts (`TransactionsContext`, etc.) to use UUIDs instead of `Date.now()`.

### [ ] Phase 4: Sync Integration
- [ ] Map all remaining endpoints (`budgets`, `agendas`, `subscriptions`).
- [ ] Implement robust error handling for background sync failures.
