# WiseWallet

Personal finance management app built with Expo SDK 54 + React Native. Offline-first with optional cloud backup via Supabase.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + React Native 0.81 |
| Language | TypeScript (strict) |
| UI Library | React Native Paper 5 (Material Design 3) |
| Routing | Expo Router (file-based) |
| Charts | react-native-chart-kit, react-native-calendars |
| Persistence | AsyncStorage (offline-first, single source of truth) |
| Backend | Express 5 + Supabase (PostgreSQL) via `wallet-api` |
| Auth | JWT (cloud) / SHA-256 passcode (offline fallback) |

## Architecture

- **Offline-first**: All reads from AsyncStorage. Writes go to local storage first, then sync to cloud.
- **Dual sync patterns**: Transactions use bulk sync (`POST /transactions/sync`). Categories, Dues, Savings, Profile use queue-based sync with exponential backoff retry.
- **Last-writer-wins (LWW)**: Conflict resolution via `updatedAt` timestamps.
- **Auth**: Email + 4-digit PIN for cloud accounts. Any username + PIN for offline-only accounts. JWT stored in AsyncStorage.

## Features

| Feature | Description |
|---------|-------------|
| Dashboard | Balance overview with available-to-spend, income/expense summary, upcoming dues, recent transactions |
| Transactions | Add/edit/delete with receipt photo (camera or gallery), payment method, establishment tracking |
| Reports | Income vs expense pie chart, expense by category, period filtering (weekly/monthly/annually), CSV/PDF export |
| Scheduled (Dues) | Recurring and one-time scheduled payments with auto-process option |
| Allocations (Savings) | Savings goals/tracking with balance allocation |
| Subscriptions | Recurring bill tracking |
| Calendar | View transactions by date |
| Learning | Financial literacy articles (Budgeting 101, Understanding Debt, Saving for the Future) |
| Cloud Sync | Auto-backup toggle, conflict resolution (merge LWW / keep local / keep cloud), manual backup/restore |
| Offline Mode | Full functionality without internet, queue-based sync when connectivity returns |
| Export/Import | JSON backup with embedded receipt images |
| Passcode Lock | 4-digit PIN to secure app on startup |
| Customization | Dark mode, language (English/Filipino), currency (PHP/USD), decimal places |
| Categories | Customizable income/expense categories |
| Payment Methods | Cash, Bank, E-Wallet, Card tracking |

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Expo CLI (`npm install -g expo-cli`)

### Install & Run

```bash
npm install
npm run web      # Browser
npm run android  # Android emulator/device
npm run ios      # iOS Simulator (Mac only)
```

### Backend (optional, for cloud sync)

The app points to `https://wallet-api-xi-plum.vercel.app/api` by default (set in `.env`). A local `json-server` is available for development:

```bash
npm run server   # Runs json-server on port 3000
```

Set `EXPO_PUBLIC_API_URL=http://localhost:3000` in `.env` to use the local server.

## Project Structure

```
wise-wallet/
├── app/              # Expo Router screens + layouts
│   ├── (tabs)/       # Tab navigator (Home, Reports, Learning, Settings)
│   ├── _layout.tsx   # Root layout with provider tree
│   ├── auth.tsx      # Login/Register screen
│   └── ...
├── components/       # Reusable UI components
├── context/          # React Context providers (10)
├── hooks/            # Custom hooks (useDues, useSavings, etc.)
├── utils/            # Core utilities
│   ├── db.ts         # AsyncStorage CRUD (701 lines)
│   ├── apiClient.ts  # Authenticated fetch wrapper
│   ├── syncQueue.ts  # Sync queue with retry logic
│   ├── syncProcessor.ts  # Queue processing engine
│   └── exportUtils.ts    # CSV/PDF export
├── repositories/     # New repo pattern (not yet wired)
├── types/            # TypeScript interfaces
├── tests-e2e/        # Playwright e2e tests
└── docs/             # Architecture plans & documentation
```

## Known Limitations

- No test suite (0 unit tests, 0 integration tests)
- No CI/CD pipeline
- No error tracking (Sentry)
- `db.ts` is a 701-line monolith in the process of being extracted to `repositories/`
- Transactions use a different sync pattern than other entities
- Search/filter for transactions not implemented
- Push notifications not configured (expo-notifications installed but unused)
- Educational videos section is a placeholder
