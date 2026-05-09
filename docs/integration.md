# Wallet & Wallet-API Integration Plan

> ⚠️ **Historical reference** — see [`savepoint.md`](./savepoint.md) for current architecture, decisions, and status.

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

### C. Authentication & Session Management
- **Account Identification**: We will use **Email Address** for registration/login.
- **Single Session Enforcement**: 
  - To prevent data conflicts across multiple active devices, the app enforces a **single active session** per user.
  - The API tracks a `currentSessionId` (Device Identity). 
  - Logging in on a new device will prompt the user to terminate the session on their previous device.
- **Uniqueness & Auto-Backup Defaults**: 
  - **Online Registration**: Defaults `autoBackup` to **ON** (`true`). Uniqueness is guaranteed by the API.
  - **Offline Registration**: Defaults `autoBackup` to **OFF** (`false`). User identity is local-only until linked.
- **Session Invalidation (401 Handler)**: If the backend returns a 401 (e.g., user deleted or token expired), the frontend `UserProfileProvider` automatically triggers a `logout()` and redirects to `/auth`.
- **System Reset Endpoint**: Developers can trigger a global app wipe by hitting `POST /api/system/reset`, which increments the `reset_epoch`.

---

## 2. Data Type & Schema Mismatches (SQL vs Frontend)

### ID Generation (Critical) [COMPLETED]
- **Supabase**: Primary keys (`id`) across all tables are defined as `UUID`.
- **Fix**: The frontend now uses `generateUUID()` (UUIDv4) for all local records.

### User Profiles & Preferences [COMPLETED]
- **Schema**: Added `isDarkMode`, `language`, `currency`, `decimalPoints`, and `autoBackup` to `profiles`.
- **Sync**: `UserProfileContext` automatically pushes preference updates to the cloud if `autoBackup` is enabled.
- **Wipe Logic**: "Clear All Data" resets preferences to defaults but preserves the user record and identity.

---

## 3. Endpoint & Page Itemization Plan

### 1. Authentication & Profiles (`AuthContext`, `UserProfileContext`) [COMPLETED]
- **API Endpoints**: `/api/auth/login`, `/api/auth/register`, `/api/userProfiles/{id}`
- **Security**: Backend uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for administrative tasks (registration/deletion).

### 2. Transactions (`TransactionsContext`) [IN PROGRESS]
- **API Endpoints**: `/api/transactions`, `/api/transactions/sync`
- **Status**: Background sync logic implemented. Currently debugging payload `undefined` issues in production.

---

## 4. Status & Progress Checklist

### [x] Phase 1: Architecture Core & Schema
- [x] Update `supabase_schema.sql` with `splitInfo` (JSONB), `isRecurring` (Agendas), and `icon` (SavingsGoals).
- [x] Fix Payment Method UI in frontend (case-insensitive chips).
- [x] Refine "Clear All Data" to preserve `userProfiles` and `users` both locally and in cloud.
- [x] Implement Auto-save toggle logic with Conflict Resolution (Keep Local vs Keep Cloud).
- [x] Add Cloud-Synced User Preferences (Dark Mode, Language, etc.).

### [x] Phase 2: Authentication Refactor
- [x] Refactor `AuthContext` and `auth.tsx` to use **Email** instead of **Username**.
- [x] Implement Offline Registration flow using local UUID generation.
- [x] Add Online Connectivity Check to warn about registration uniqueness.
- [x] Implement backend Service Role integration to resolve RLS registration errors.

### [x] Phase 3: UUID Local Generation
- [x] Add `uuid` dependency to `wallet`.
- [x] Update all Contexts (`TransactionsContext`, etc.) to use UUIDs instead of `Date.now()`.

### [x] Phase 4: Sync Integration & Session Security
- [x] Map all remaining endpoints (`budgets`, `agendas`, `subscriptions`, `savingsGoals`).
- [x] Implement robust background sync payload mapping.
- [x] Implement Session Invalidation (401 auto-logout).
- [x] Add `POST /api/system/reset` developer tool.
- [x] Finalize background sync payload debugging (Transactions sync body).
- [x] Implement Single-Session enforcement (Device Identity check).
- [ ] Implement "Link to Cloud" upgrade flow for offline registrations.

### [x] Phase 5: Backend Cleanup — Remove Budget/Subscription, Rename Agenda/SavingsGoal
- [x] Delete all budget files (routes, controller, service, repository, schema).
- [x] Delete all subscription files (routes, controller, service, repository, schema).
- [x] Rename agenda → due with updated schema (`amount` required, `frequency`, `autoProcess`, `type`, `categoryId`).
- [x] Rename savingsGoal → savingsItem with updated schema (`balance` replaces `targetAmount`/`currentAmount`).
- [x] Update `app.js` to mount `/api/dues` and `/api/savingsItems`.
- [x] Update `supabase_schema.sql`: drop budgets/subscriptions, create dues/savingsItems tables.
- [x] Add `dueId` and `savingsItemId` FK columns to transactions and dues tables.
- [x] Update docs (`savepoint.md`, `integration.md`).

