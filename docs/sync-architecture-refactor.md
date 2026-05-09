# Sync Architecture Refactoring Plan

> Current State Analysis (2026-05-09)
>
> This document outlines the issues with the current offline/online sync system and a phased plan to make it robust.

---

## Current Issues Summary

### Critical Issues (Must Fix)

| # | Issue | Severity |
|---|-------|----------|
| 1 | **No retry queue** - Failed syncs are silently swallowed, never retried | CRITICAL |
| 2 | **Inconsistent 401 handling** - Pattern A entities (dues, savings, categories) have no 401 awareness after the global handler fires | CRITICAL |
| 3 | **Double 401 handling** - UserProfileContext & TransactionsContext call `logout()` AFTER authFetch already handled it | HIGH |
| 4 | **Side effect in state setter** - `syncWithServer()` called inside `setTransactions(prev => ...)` which can cause duplicates in StrictMode | HIGH |
| 5 | **autoBackup dual-source** - Pattern A reads from `getSetting('autoBackup')` (string), Pattern B from `profile?.autoBackup` (boolean) - can diverge | HIGH |
| 6 | **"Link to Cloud" incomplete** - Offline accounts cannot be merged to online accounts; UI exists but implementation is stub | MEDIUM |

### Architectural Issues

| # | Issue |
|---|-------|
| 7 | **Two sync patterns** - Pattern A (fire-and-forget) vs Pattern B (batch sync) are inconsistent |
| 8 | **No connectivity awareness** - No native NetInfo integration, no offline banner |
| 9 | **No sync status UI** - User doesn't know if data is synced, pending, or failed |
| 10 | **No conflict resolution by timestamp** - No `updatedAt` field; last-to-sync wins silently |
| 11 | **Restore fetches without userId filter** - `performRestore()` uses unfiltered endpoints then filters client-side |
| 12 | **Manual backup creates duplicates** - No existence check before POSTing |

---

## Proposed Architecture: Sync Layer v2

### Core Principles

1. **Single Source of Truth**: All sync goes through one centralized engine
2. **Offline-First**: Never block UI for network; sync is always background
3. **Retry Everything**: Failed syncs go to a persistent queue with exponential backoff
4. **Observable Status**: UI always knows sync state (synced, syncing, pending, failed)
5. **Unified Auth Handling**: 401 is handled in one place with proper error propagation

---

## Phase 1: Quick Wins (0-3 days)

Fix critical bugs without major architecture changes.

### 1.1 Fix: Side Effect in State Setter

**File**: `context/TransactionsContext.tsx:172-178`

**Current (broken)**:
```typescript
setTransactions(prev => {
    const updated = [...prev, newTransaction];
    if (API_URL && activeUserId) {
        syncWithServer(updated);  // SIDE EFFECT! Not allowed in pure updater
    }
    return updated;
});
```

**Fix**:
```typescript
const updated = [...transactions, newTransaction];
await saveTransaction(newTransaction);
setTransactions(updated);
if (API_URL && activeUserId && profile?.autoBackup) {
    syncWithServer(updated);  // Now outside the state setter
}
```

### 1.2 Fix: Double 401 Handling

**Files**: `context/UserProfileContext.tsx:61-65`, `context/TransactionsContext.tsx:112-116`

**Problem**: Both contexts explicitly check `response.status === 401` and call `logout()`, but `authFetch` already handled it.

**Fix**: Remove the explicit 401 checks. Trust `authFetch` to handle it, and add proper error propagation:

```typescript
// In authFetch, after clearing storage:
if (response.status === 401) {
    // ... existing logic ...
    
    // Throw a special error so callers can distinguish 401 from network errors
    const error = new Error('Session expired');
    (error as any).status = 401;
    (error as any).isAuthError = true;
    throw error;  // THROW instead of just returning response
}
```

Then remove the explicit checks, but catch auth errors where needed:
```typescript
try {
    const response = await authFetch(...);
    if (!response.ok) return;
    // ...
} catch (error: any) {
    if (error.isAuthError) {
        // Already handled by authFetch - just return early
        return;
    }
    // Handle other errors
}
```

### 1.3 Fix: Unify autoBackup Source

**Files**: `hooks/useDues.ts`, `hooks/useSavings.ts`, `context/CategoriesContext.tsx`

**Problem**: Pattern A reads `getSetting('autoBackup') !== 'false'` (from AsyncStorage settings), while Pattern B reads `profile?.autoBackup` (from React state).

**Fix**: Standardize on using the profile object, since that's what the UI toggle modifies.

```typescript
// Current (Pattern A):
const autoBackup = await getSetting('autoBackup');
if (API_URL && activeUserId && autoBackup !== 'false') { ... }

// Fixed: Import useUserProfile and use:
const { profile } = useUserProfile();
// Then sync only if profile?.autoBackup === true
```

Or even better: Create a single `useAutoBackup()` hook that reads from the canonical source.

### 1.4 Fix: userId Filter in Restore

**File**: `app/(tabs)/settings.tsx:263-339` (performRestore)

**Problem**: Fetches `/transactions`, `/categories` without `?userId=`, then filters client-side.

**Fix**:
```typescript
// Current:
const txCheck = await authFetch(`transactions`);

// Fixed:
const txCheck = await authFetch(`transactions?userId=${activeUserId}`);
```

---

## Phase 2: Sync Queue & Retry (3-7 days)

Add a persistent retry queue without changing existing patterns too much.

### 2.1 Create a Sync Queue

**New File**: `utils/syncQueue.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncQueueItem {
  id: string; // unique for dedup
  entity: 'transactions' | 'categories' | 'dues' | 'savingsItems' | 'profile';
  operation: 'create' | 'update' | 'delete';
  entityId?: string;
  data?: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

const QUEUE_KEY = 'sync_queue';

// Add item to queue (idempotent - if same entity+operation+entityId exists, replace)
export async function enqueueSync(
  entity: SyncQueueItem['entity'],
  operation: SyncQueueItem['operation'],
  entityId?: string,
  data?: any
): Promise<void> {
  const queue = await getSyncQueue();
  const itemId = `${entity}:${operation}:${entityId || 'batch'}`;
  
  const existingIndex = queue.findIndex(item => item.id === itemId);
  const newItem: SyncQueueItem = {
    id: itemId,
    entity,
    operation,
    entityId,
    data,
    timestamp: Date.now(),
    retryCount: 0,
  };
  
  if (existingIndex >= 0) {
    queue[existingIndex] = newItem;
  } else {
    queue.push(newItem);
  }
  
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  
  // Trigger processing (debounced)
  triggerSyncProcessing();
}

// Get all items in queue
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Remove item from queue after success
export async function dequeueSync(itemId: string): Promise<void> {
  const queue = await getSyncQueue();
  const filtered = queue.filter(item => item.id !== itemId);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

// Update retry count after failure
export async function markSyncFailed(itemId: string, error: string): Promise<void> {
  const queue = await getSyncQueue();
  const item = queue.find(i => i.id === itemId);
  if (item) {
    item.retryCount++;
    item.lastError = error;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}
```

### 2.2 Create Sync Processor with Exponential Backoff

**New File**: `utils/syncProcessor.ts`

```typescript
import { getSyncQueue, dequeueSync, markSyncFailed, SyncQueueItem } from './syncQueue';
import { authFetch } from './apiClient';
import { API_URL } from './db';

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
function getRetryDelay(retryCount: number): number {
  return Math.min(Math.pow(2, retryCount) * 1000, 32000);
}

// Map entity to endpoint
const entityEndpoints: Record<SyncQueueItem['entity'], string> = {
  transactions: '/transactions',
  categories: '/categories',
  dues: '/dues',
  savingsItems: '/savingsItems',
  profile: '/userProfiles',
};

// Process a single queue item
async function processItem(item: SyncQueueItem): Promise<boolean> {
  try {
    const endpoint = entityEndpoints[item.entity];
    let response: Response;
    
    switch (item.operation) {
      case 'create':
        response = await authFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(item.data),
        });
        break;
      case 'update':
        response = await authFetch(`${endpoint}/${item.entityId}`, {
          method: 'PUT',
          body: JSON.stringify(item.data),
        });
        break;
      case 'delete':
        response = await authFetch(`${endpoint}/${item.entityId}`, {
          method: 'DELETE',
        });
        break;
      default:
        return false;
    }
    
    if (response.ok) {
      await dequeueSync(item.id);
      return true;
    } else if (response.status === 401) {
      // Auth error - will be handled by authFetch
      return false;
    } else {
      // Server error - mark for retry
      await markSyncFailed(item.id, `HTTP ${response.status}`);
      return false;
    }
  } catch (error: any) {
    // Network error - mark for retry
    await markSyncFailed(item.id, error.message || 'Network error');
    return false;
  }
}

// Process all items in queue
export async function processSyncQueue(): Promise<void> {
  if (!API_URL) return; // No sync without API
  
  const queue = await getSyncQueue();
  const now = Date.now();
  
  for (const item of queue) {
    // Check if it's time to retry (if previously failed)
    if (item.retryCount > 0) {
      const delay = getRetryDelay(item.retryCount);
      const nextAttempt = item.timestamp + delay;
      if (now < nextAttempt) continue; // Not yet time
    }
    
    await processItem(item);
  }
}

// Debounced trigger - call this when items are enqueued
let processingTimeout: NodeJS.Timeout | null = null;
export function triggerSyncProcessing(): void {
  if (processingTimeout) clearTimeout(processingTimeout);
  processingTimeout = setTimeout(processSyncQueue, 500); // 500ms debounce
}
```

### 2.3 Wrap Existing Sync Functions with Queue

**Example**: `hooks/useDues.ts`

```typescript
// Current:
const response = await authFetch(`dues`, {
  method: "POST",
  body: JSON.stringify(newDue)
}).catch(err => console.error("Sync error:", err));

// With Queue:
import { enqueueSync } from '../utils/syncQueue';

// Save locally first, then enqueue sync
await saveDue(newDue);
setDues(prev => [...prev, newDue]);

if (API_URL && activeUserId && profile?.autoBackup) {
  enqueueSync('dues', 'create', newDue.id, newDue);
}
```

### 2.4 Sync Status for UI

**New Hook**: `hooks/useSyncStatus.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { getSyncQueue, SyncQueueItem } from '../utils/syncQueue';
import { useUserProfile } from '../context/UserProfileContext';

export interface SyncStatus {
  pendingCount: number;
  failedCount: number;
  hasPending: boolean;
  hasFailed: boolean;
  pendingItems: SyncQueueItem[];
  lastSyncedAt: number | null;
}

export function useSyncStatus() {
  const { profile } = useUserProfile();
  const [status, setStatus] = useState<SyncStatus>({
    pendingCount: 0,
    failedCount: 0,
    hasPending: false,
    hasFailed: false,
    pendingItems: [],
    lastSyncedAt: null,
  });

  const refresh = useCallback(async () => {
    if (!profile?.autoBackup) {
      setStatus({
        pendingCount: 0,
        failedCount: 0,
        hasPending: false,
        hasFailed: false,
        pendingItems: [],
        lastSyncedAt: null,
      });
      return;
    }

    const queue = await getSyncQueue();
    const pendingItems = queue.filter(item => !item.lastError || item.retryCount === 0);
    const failedItems = queue.filter(item => item.lastError && item.retryCount > 0);
    
    const lastSyncedRaw = await AsyncStorage.getItem('last_synced_at');
    const lastSyncedAt = lastSyncedRaw ? parseInt(lastSyncedRaw, 10) : null;

    setStatus({
      pendingCount: queue.length,
      failedCount: failedItems.length,
      hasPending: queue.length > 0,
      hasFailed: failedItems.length > 0,
      pendingItems: queue,
      lastSyncedAt,
    });
  }, [profile?.autoBackup]);

  useEffect(() => {
    refresh();
    // TODO: Add listener for queue changes
  }, [refresh]);

  return { ...status, refresh };
}
```

---

## Phase 3: Connectivity & UI (3-5 days)

### 3.1 Add Native Connectivity Detection

**Install**: `@react-native-community/netinfo`

**New Context**: `context/NetworkContext.tsx`

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextType {
  isOnline: boolean;
  isConnectionExpensive: boolean;
  connectionType: string | null;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkContextType>({
    isOnline: true,
    isConnectionExpensive: false,
    connectionType: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(netInfoState => {
      setState({
        isOnline: netInfoState.isConnected ?? true,
        isConnectionExpensive: netInfoState.isConnectionExpensive ?? false,
        connectionType: netInfoState.type,
      });

      // If coming back online, process the queue
      if (netInfoState.isConnected) {
        triggerSyncProcessing();
      }
    });

    return unsubscribe;
  }, []);

  return (
    <NetworkContext.Provider value={state}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used within NetworkProvider');
  return context;
}
```

### 3.2 Add Sync Status UI Elements

- **Offline Banner**: Show at top when `!isOnline`
- **Sync Indicator**: Small badge or icon when `hasPending` or `hasFailed`
- **Settings Screen**: Show "Last synced: X minutes ago" and "Pending: X items"

---

## Phase 4: Conflict Resolution & Upgrade Flow (5-10 days)

### 4.1 Add updatedAt Field to All Entities

Every entity needs an `updatedAt` timestamp for conflict detection.

**Database Changes**:
- Add `updatedAt: string` (ISO string) to all entities
- Update on every create/update
- Use this during merge: `if (remote.updatedAt > local.updatedAt)` → remote wins

### 4.2 Implement "Link to Cloud" Flow

**Goal**: Allow an offline-registered account to be linked to an online account.

**Steps**:
1. User taps "Link Now" in CloudLinkBanner
2. User enters email/passcode (to verify)
3. Try to register online with that email:
   - If email doesn't exist: Create online account with local data
   - If email exists and password matches: Merge local data with existing online data
   - If email exists but password wrong: Show error

**Key**: Need to compare `updatedAt` timestamps during merge.

### 4.3 Real Dry-Run Comparison for Backup Toggle

**Goal**: Show user what will change, not just "data exists".

**Implementation**:
```typescript
// Fetch both local and cloud
const localData = await getAllLocalData();
const cloudData = await getAllCloudData(userId);

// Compare and generate diff
const diff = {
  localOnly: findLocalOnly(localData, cloudData),
  cloudOnly: findCloudOnly(localData, cloudData),
  conflicts: findConflicts(localData, cloudData), // Same ID, different updatedAt
};

// Show user:
// - "5 transactions only on this device"
// - "3 transactions only in cloud"  
// - "2 items have newer versions in cloud"
```

---

## Implementation Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | Fix side effect in state setter | 1h | CRITICAL - could cause data issues |
| 🔴 P0 | Fix double 401 handling | 2h | CRITICAL - auth confusion |
| 🔴 P0 | Unify autoBackup source | 2h | CRITICAL - sync not triggering when expected |
| 🟡 P1 | Add userId filter to restore | 1h | HIGH - inefficiency + potential data leakage |
| 🟡 P1 | Sync Queue implementation | 8h | HIGH - no retry = data loss risk |
| 🟡 P1 | Network connectivity context | 4h | MEDIUM - better UX when offline |
| 🟢 P2 | Sync status UI | 4h | MEDIUM - user transparency |
| 🟢 P2 | updatedAt timestamps | 6h | MEDIUM - foundation for conflict resolution |
| 🟢 P2 | "Link to Cloud" implementation | 8h | LOW-MEDIUM - edge case but important for completeness |
| 🟢 P3 | Dry-run comparison diff | 8h | LOW - nice to have |

---

## Migration Checklist

- [ ] Phase 1.1: Fix `syncWithServer()` inside state setter
- [ ] Phase 1.2: Make `authFetch` throw on 401, remove explicit checks from contexts
- [ ] Phase 1.3: Standardize autoBackup source on profile object
- [ ] Phase 1.4: Add `?userId=` to restore fetch URLs
- [ ] Phase 2.1: Implement `syncQueue.ts`
- [ ] Phase 2.2: Implement `syncProcessor.ts` with exponential backoff
- [ ] Phase 2.3: Update Pattern A entities to use `enqueueSync()`
- [ ] Phase 2.4: Create `useSyncStatus` hook
- [ ] Phase 3.1: Install `@react-native-community/netinfo`, create `NetworkContext`
- [ ] Phase 3.2: Add offline banner + sync indicators to UI
- [ ] Phase 4.1: Add `updatedAt` to all entities, update on mutations
- [ ] Phase 4.2: Implement "Link to Cloud" merge flow
- [ ] Phase 4.3: Implement dry-run comparison for backup toggle
