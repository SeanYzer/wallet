# authFetch Migration Plan (1.4)

## Goal
Replace the fragile `Response`-mutating `authFetch` with a clean `ApiResult<T>` return type.

## Changes per file

| # | File | Call sites | Pattern | Status |
|---|------|-----------|---------|--------|
| 1 | `utils/apiClient.ts` | Definition | Rewrite to return `ApiResult<T>` | ✅ Done |
| 2 | `utils/syncProcessor.ts` | 3 calls (lines 67,74,81) | `response.ok` → `ok`, `response.status` → `status` | 🔄 |
| 3 | `context/TransactionsContext.tsx` | 2 calls (lines 82, 103) | `response.ok` + `response.json()` → destructure `ok, data` | ⏳ |
| 4 | `context/CategoriesContext.tsx` | 1 call (line 55) | Same pattern | ⏳ |
| 5 | `context/UserProfileContext.tsx` | 2 calls (lines 59, 95) | Same pattern | ⏳ |
| 6 | `app/add-transaction.tsx` | 1 call (line 52) | Same pattern | ⏳ |
| 7 | `app/payment-methods.tsx` | 3 calls (lines 35, 55, 77) | Same pattern (no .json needed) | ⏳ |
| 8 | `hooks/useSavings.ts` | 1 call (line 28) | Same pattern | ⏳ |
| 9 | `hooks/useDues.ts` | 1 call (line 27) | Same pattern | ⏳ |
| 10 | `app/(tabs)/settings.tsx` | ~50 calls | Bulk update — see below | ⏳ |

## File details

### 2. utils/syncProcessor.ts
- `interface SyncResult`: remove `response?: Response` (unused)
- `processSingleItem`: `const result = await authFetch(...)` → destructure `{ ok, status, error }`
- Remove `let response: Response;`

### 3-9 (simple callers)
All follow the same pattern:
```ts
// Before
const response = await authFetch(endpoint);
if (response.ok) {
  const data = await response.json();
}

// After
const { ok, data } = await authFetch(endpoint);
if (ok && data) {
  // use data directly
}
```

### 10. app/(tabs)/settings.tsx
~50 calls across 8 distinct code blocks. Each follows one of:
- **Group A** — Parallel GET + .json() → destructure results
- **Group B** — POST/PUT/DELETE with body → destructure, ignore response
- **Group C** — Check `.ok` then access body → single destructure
- **Group D** — `.json()` called twice on same response (bug: lines 206-210) → fixed
- **Group E** — Access `.status` and `.ok` → destructure both
