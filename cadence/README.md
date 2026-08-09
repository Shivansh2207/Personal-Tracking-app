# DEVBEAST OS

**Run your life like a system.**

DEVBEAST OS is a production-minded personal operating system for planning and executing tasks, habits, study, work, training, goals, and personal reviews. It is built as a mobile-first Expo application backed by Firebase. One completion updates the relevant dashboard score, streak, analytics, goal progress, and history without duplicate entry.

## Product features

- Email/password registration, login, password reset, persistent sessions, and account deletion
- Six-step onboarding for life areas, habits, a main goal, schedule preferences, and reminders
- Home command center with a live Daily Score, streak, top priorities, tasks, habits, focus time, and data-derived insight
- Today, calendar, upcoming, and backlog planning views
- Tasks with status, priority, duration, categories, linked goals, subtasks, reminders, recurrence, rescheduling, carry-forward, and top-priority ordering
- Daily, weekday, weekend, weekly, selected-weekday, monthly, and custom-interval recurrence without pre-creating thousands of records
- Yes/no, count, and duration habits with daily, weekday, weekly-target, monthly-target, and custom schedules
- Monthly habit grid, completion percentages, scheduled-day-aware streaks, and rest/skip handling
- Subjects, topics, progress, confidence, revision dates, study history, and focus sessions
- Stopwatch and preset/custom focus timers that survive backgrounding and app restarts
- Lightweight gym/activity tracking for workouts, walking, running, cycling, sports, and custom activity
- Manual, numeric, task-, habit-, milestone-, and topic-based goals
- Daily trends, category distribution, weekly execution, habit analytics, study analytics, time variance, and yearly consistency heatmap
- Daily Mission Log and Weekly CEO Review with automatically populated objective metrics
- Local notifications for task reminders, daily planning/review, and weekly review
- Search, JSON/CSV export, dark/light themes, accent selection, profile preferences, and secure deletion
- Optimistic updates, realtime listeners for active data, bounded analytics reads, and AsyncStorage snapshot caching
- Development-only realistic sample week for immediately exploring the complete product

## Technology

- Expo SDK 57, React Native 0.86, React 19, and TypeScript
- Expo Router for file-based navigation
- Firebase Authentication and Cloud Firestore
- Zustand for authenticated client state and the recoverable timer session
- Expo Notifications, AsyncStorage, Reanimated, Gesture Handler, SVG, and system-aware theming
- Jest/ts-jest for pure calculation and simulated-week tests

Firebase Storage is intentionally not used because the current product stores no user files. Remote push infrastructure is also outside the MVP; reminders are scheduled locally on the device.

## Architecture

```text
src/
  app/                 Expo Router screens and route groups
    (auth)/            Welcome, sign up, sign in, forgot password
    (onboarding)/      First-run system builder
    (tabs)/            Home, Plan, Track, Analytics, Profile
    task|habit|goal/   Create and detail flows
    subject|focus/     Study system and timer
    review|history/    Daily/weekly reviews and day history
    settings/          Profile, appearance, categories, reminders, data
  components/          Reusable UI, charts, task, habit, and dashboard parts
  services/            Firebase services and business orchestration
    analytics/         Pure scoring, recurrence, habits, aggregation, insights
    firebase/          Config, converters, paths, errors, and local cache
  store/               Auth, live data, and timer Zustand stores
  theme/               Design tokens and theme provider
  types/               Shared Firestore and domain models
  utils/               Local-date and formatting utilities
firebase/              Firestore rules, index config, and Firebase CLI config
tools/                 Firebase setup and live isolation verification
__tests__/              Pure unit and simulated end-to-end business tests
```

All user records live under `users/{uid}`. The path is the ownership boundary, and denormalized `userId` values are validated against it by Firestore rules. Screens call service modules rather than issuing raw Firestore writes.

## Prerequisites

- Node.js 22.13 or newer (required by Expo SDK 57)
- npm
- Android Studio/emulator or an Android device for Android development
- macOS with Xcode for an iOS simulator or local iOS build
- A Firebase project with Authentication and a Firestore database

## Install and run

```powershell
Set-Location 'E:\personal\Dev app\cadence'
npm install
Copy-Item .env.example .env
```

Fill in `.env`, then start Metro:

```powershell
npm start
```

Useful targets:

```powershell
npm run android
npm run ios
npm run web
```

For Expo Go, scan the QR code printed by `npm start`. Local notifications work in Expo Go; remote push notifications on Android require a development build in modern Expo SDKs. iOS development from Windows requires a physical device with Expo Go or an EAS build because the iOS simulator only runs on macOS.

## Firebase client configuration

Create a Firebase Web app in **Firebase Console -> Project settings -> General**, then copy these public client identifiers into `.env`:

```dotenv
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

The web client values identify the Firebase project; they are not administrative secrets. Authorization is enforced by `firebase/firestore.rules`. Never place a service-account JSON file in `.env`, the app source, or version control.

## Firebase Authentication

In **Firebase Console -> Authentication -> Sign-in method**, enable **Email/Password**. Add any web preview or production domains under authorized domains when using the web build. Google Sign-In is intentionally left as a future provider; the authentication service boundary is ready for another provider without restructuring the screens.

## Firestore and security rules

Create the default Cloud Firestore database in Native mode. The project uses automatic single-field indexes only, so no composite indexes are currently required.

With Firebase CLI installed and authenticated:

```powershell
firebase deploy --config firebase/firebase.json --only firestore:rules,firestore:indexes
```

Alternatively, an administrator can use the included setup helper with a service account that has Firebase Rules, Firestore, and Identity Platform administration permissions:

```powershell
npm run firebase:setup
```

The helper verifies Firestore, enables email/password authentication, publishes rules, and publishes the declared index configuration. The default script expects the ignored credential path `..\_secrets\firebase-admin.json`; change the package script or call the tool with `--key <path>` for another location.

## Notifications

The `expo-notifications` config plugin is already declared in `app.json`. On Android, the app creates a default channel. Users grant permission during onboarding or in Settings and can independently configure task, habit/study, planning, daily-review, goal, and weekly-review preferences.

Task notifications are one-off local schedules. Planning, review, and weekly-review reminders are rebuilt when settings change. Device delivery should be verified on a physical device; browser notification behavior is not the mobile source of truth.

## Demo data

In a development build, open **Profile -> Data & backup -> Load sample week**. The action adds deterministic sample tasks, habits, study sessions, workouts, subjects, topics, and goals, then recomputes seven daily aggregate documents so Home, Calendar, History, and Analytics are immediately populated. Stable demo IDs make repeated loads idempotent, and existing non-demo records are untouched.

## Quality checks

```powershell
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo-doctor
```

The test suite covers score redistribution, task completion, frequency-aware habit scheduling, consistency, streaks, rest days, timezone/local-day boundaries, weekly aggregation, goal progress, recurrence/materialization, timer duration, and a simulated week.

To verify the deployed Firebase project with two temporary accounts:

```powershell
npm run firebase:verify
```

The verifier exercises every major collection, schema rejection, deterministic habit-log IDs, cross-user read/write isolation, and self-service record deletion, then removes both temporary users and their data.

## Data behavior

- Active categories, habits, goals, subjects, recent stats, today's records, recurring templates, and backlog use bounded realtime listeners.
- Historical analytics use explicit date-range reads and client-side aggregation.
- Daily aggregates are recomputed after relevant mutations and power trends, streaks, calendar intensity, and reviews.
- AsyncStorage caches preferences, timer state, and last-known snapshots for useful cold-start behavior.
- Firestore remains the source of truth; optimistic UI rolls back and surfaces a friendly error when a write fails.
- Dates use local `YYYY-MM-DD` keys. Timestamps are reserved for exact instants, preventing timezone-driven streak errors.

## Known limitations

- The app is mobile-first. The web target is useful for development and review but does not replace device testing for notifications, safe areas, gestures, or background timer behavior.
- Local reminders are device-specific and are not synchronized as remote push jobs across multiple devices.
- Firestore's React Native SDK does not provide durable offline query persistence in this setup; last-known snapshots are cached locally, and pending writes rely on the SDK while the process remains alive.
- `npm audit` currently reports advisories through Expo/Metro's transitive build tooling. npm's proposed forced remediation downgrades Expo to SDK 46, so the safe path is to track compatible SDK 57 updates rather than force an incompatible dependency tree.
- Health-platform integrations, calendar sync, social/accountability features, widgets, voice capture, and AI planning are intentionally future work.
- App Store/Play Store release signing and EAS project configuration are deployment steps, not committed credentials.

## Product identity

- App name: **DEVBEAST OS**
- Bundle identifiers: `com.devbeast.os`
- Deep-link scheme: `devbeast://`
- Product line: **Run your life like a system.**
