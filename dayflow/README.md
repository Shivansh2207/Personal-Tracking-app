# DayFlow

**Build a day that runs itself.**

DayFlow is a personal daily operating system for students and young professionals.
You configure your routines, study timetable and responsibilities once; DayFlow
assembles each day for you and turns what you actually did into analytics you can
trust.

It is not a to-do list, a habit tracker, a calendar, a study timer or a dashboard.
It is all of them, connected.

> Detailed setup is acceptable. Daily usage must be fast.

---

## Contents

- [What makes it different](#what-makes-it-different)
- [Features](#features)
- [Architecture](#architecture)
- [Folder structure](#folder-structure)
- [Technology](#technology)
- [Getting started](#getting-started)
- [Firebase setup](#firebase-setup)
- [Environment variables](#environment-variables)
- [Running on Android and iOS](#running-on-android-and-ios)
- [Notifications](#notifications)
- [Testing](#testing)
- [Production build](#production-build)
- [Renaming the app](#renaming-the-app)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What makes it different

**Not everything is a task.** A routine declares *how it is measured* and *when it
is owed*, and each tracking type is scored on its own terms:

| Type | Example | How it is scored |
| --- | --- | --- |
| `check` | Face routine | Completed / not completed on scheduled days |
| `count` | Read 20 pages | `actual / target` — 15 of 20 is **75%**, not zero |
| `duration` | Meditate 15 min | Minutes against the target, partial credit kept |
| `time` | Wake at 07:00 | Adherence derived from the deviation, with a tolerance |
| `session` | Gym 4× per week | Sessions per period — **never** a per-day failure |
| `numeric` | Weight | Recorded as a measurement, never scored |

Five rules the analytics never break:

1. A day a routine was not scheduled on is **never** a miss.
2. A flexible weekly target is measured per week. Doing the gym on Tue/Thu/Sat/Sun
   is 4 of 4, not three missed days.
3. Partial effort is partial, not zero.
4. Rest days are a state, not a gap — they leave the denominator entirely.
5. Time spent never marks a chapter complete. You confirm progress.

Spontaneous study counts toward your **total** study time but never toward
**timetable adherence** — those are different questions and are reported
separately.

---

## Features

**Today** — wake card with a two-tap time logger, a dynamic *Up Next* that
surfaces whatever is happening now (or was missed), and a chronological timeline
mixing routines, timetable slots and tasks. Every routine type completes inline
without leaving the screen.

**Study** — Course → Subject → Chapter → Topic. A weekly timetable whose slots
either target a fixed chapter or resolve to the *next incomplete* one. A
crash-proof focus timer, a sub-20-second manual study log, and a spaced-repetition
revision queue.

**Plan** — a consistency calendar, task views (today / upcoming / overdue /
completed), routine and recurring-task management, and a backlog for undated work.
Missed tasks are *moved*, never duplicated.

**Insights** — six separate sections (overview, study, routines, schedule, tasks,
wake & sleep). No single mysterious "productivity score" dominates the product;
each area is reported on its own terms, and comparisons only appear when there is a
previous period with real data.

**You** — profile, preferences, notification categories, categories, appearance
(dark / light / system, five accents), JSON and CSV export, account deletion.

---

## Architecture

```
 SETUP ──► AUTO-GENERATED DAY ──► QUICK LOGGING ──► HISTORY ──► ANALYTICS
```

Layering is strict: **UI never talks to Firestore**.

```
app/                screens only — no queries, no business logic
components/         presentational, theme-aware
services/analytics/ pure functions, no Firebase import, fully unit tested
services/recurrence/ pure schedule expansion
services/*Service   the only modules that read or write Firestore
store/              Zustand: live state, optimistic mutations
```

### The aggregation funnel

Raw records are the source of truth. `dailySummaries/{dateKey}` and
`weeklySummaries/{weekId}` exist only to make analytics fast, and **only one
function writes them**: `recomputeDailySummary`. Every mutation in the app funnels
through it (debounced), which is what keeps Today, the calendar, Insights and the
weekly review agreeing with each other.

### Recurrence

A recurring task is stored **once** as a template. Occurrences are computed on
demand; a real document is written only when you touch a specific day, and it
carries `parentTaskId` so the template knows that date is already materialised. A
ten-year daily routine is one document, not 3,650.

### Dates

Every grouping key is a `YYYY-MM-DD` string built from **local** calendar fields,
never from `toISOString()`. A task completed at 23:55 belongs to that day. A study
session that crosses midnight is attributed to the day it *started* on while both
exact timestamps are preserved. Clock averages handle the midnight wrap, so a
23:50 and a 00:10 bedtime average to midnight rather than midday.

### The focus timer

Persisted as timestamps (`startedAt` + accumulated run segments), never as a
countdown. Backgrounding, locking the phone or a crash cannot corrupt the recorded
duration — elapsed time is always recomputed on resume.

---

## Folder structure

```
src/
  app/                       expo-router routes
    (auth)/                  welcome, sign-in, sign-up, forgot-password
    (onboarding)/            7-step setup
    (tabs)/                  index (Today), study, plan, insights, you
    routine/ task/ subject/  editors and detail screens
    timetable/ focus/ study/ slot editor, timer, manual log
    review/ history/         daily + weekly review, day history
    settings/                preferences, study, notifications, categories,
                             appearance, data, about, profile
  components/
    ui/                      Screen, BottomSheet, Calendar, Pickers, Progress,
                             States, Controls, MetricCard, Text, Icon…
    today/                   ActivityRow (per tracking type), WakeCard, UpNext
    routines/                TrackingTypeSheet
    analytics/               SVG charts
  services/
    analytics/               routines, wake, study, tasks, daily, weekly
    recurrence/              schedule expansion, virtual task occurrences
    firebase/                config, paths, cache, converters, errors
    *Service.ts              routine, task, study, timetable, revision,
                             summary, category, user, notification, export, seed
  store/                     authStore, dataStore, timerStore
  theme/                     tokens + provider (dark/light, 5 accents)
  types/                     domain model
  utils/                     date + clock utilities
  constants/app.ts           product name lives here, and only here
firebase/                    firestore.rules, firestore.indexes.json
tools/                       firebase-setup.mjs, verify-firebase.mjs
__tests__/                   date, routines, recurrence, study, 14-day simulation
```

---

## Technology

- React Native 0.86 / Expo SDK 57 / TypeScript (strict)
- Expo Router (file-based navigation, custom tab bar)
- Firebase Authentication + Cloud Firestore (Web SDK, React Native build)
- Zustand for global client state
- Reanimated + Gesture Handler for interactions
- `react-native-svg` — all charts are hand-drawn, no charting dependency
- Expo Notifications (local only), AsyncStorage, expo-haptics, expo-keep-awake

Everything runs inside Firebase's free Spark plan. There are no Cloud Functions
and no Firebase Storage dependency.

---

## Getting started

```bash
cd dayflow
npm install
cp .env.example .env      # then fill in your Firebase web config
npx expo start
```

---

## Firebase setup

You need a Firebase project with **Cloud Firestore** created (any region) and
**Email/Password** sign-in enabled.

A helper script does the rest using a service-account key:

```bash
node tools/firebase-setup.mjs --key ../_secrets/firebase-admin.json
```

It will:

1. verify Firestore exists and report its region,
2. enable the Email/Password sign-in provider,
3. publish `firebase/firestore.rules` as the live ruleset,
4. create any composite indexes listed in `firebase/firestore.indexes.json`.

> The service-account key is a **secret**. Keep it outside the repo — `.gitignore`
> already excludes `_secrets/` and any `*firebase-adminsdk*.json`.

### Indexes

None are required. Every query uses a single equality or range filter and sorts
client-side, which Firestore's automatic single-field indexes already cover.

### Security rules

Rules live in `firebase/firestore.rules`. Ownership is *structural*: all data sits
under `users/{uid}/…`, so a request can only reach documents whose path contains
the caller's own uid, and no collection-group read path exists. On top of that the
rules validate enums, string lengths, percentage bounds, date-key format, and that
a denormalised `userId` always agrees with the path.

Verify the whole thing end to end against the live project:

```bash
node tools/verify-firebase.mjs --key ../_secrets/firebase-admin.json
```

This creates two throwaway accounts, writes one document of every kind, proves the
malformed-write and cross-user cases are rejected, then deletes both accounts.
Current status: **31 checks, 0 failures**.

---

## Environment variables

Copy `.env.example` to `.env`:

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

These are public client identifiers, not secrets — they ship inside the app
bundle. Access control is enforced entirely by the Firestore rules.

---

## Running on Android and iOS

```bash
npm run android     # Android device or emulator
npm run ios         # iOS simulator (macOS only)
npm run web         # browser, for quick layout checks
```

Expo Go covers everything except notification delivery, which needs a development
build:

```bash
npx expo run:android
npx expo run:ios
```

`metro.config.js` explicitly enables package exports with the `react-native`
condition — that is what resolves the Firebase build exposing
`getReactNativePersistence`, which keeps you signed in between launches.

---

## Notifications

All reminders are scheduled **on the device**. Nothing about your day is sent to a
notification server, and no paid plan is involved.

Categories, each independently switchable: wake, routines, study timetable, tasks,
revision, daily summary, weekly review. Timetable reminders repeat weekly per slot
day with a configurable lead time. Wording is deliberately neutral — "You have
completed 3 of 4 gym sessions this week", never guilt.

---

## Testing

```bash
npm test          # 99 unit tests
npm run typecheck # tsc --noEmit
```

Coverage focuses on the logic that is easy to get quietly wrong:

- local-day keys at 23:55 and 00:05, month/year boundaries, DST-free arithmetic
- clock deviation across midnight; averaging that ignores missing days
- per-type routine progress; partial credit; rest days leaving the denominator
- flexible weekly targets — availability vs. obligation, and per-period scoring
- streaks across unscheduled days, rest days and an unfinished today
- every recurrence rule, including monthly clamping and "last Sunday"
- virtual vs. materialised task occurrences; no duplication after carry-forward
- timetable adherence vs. spontaneous study; partial slot credit
- chapter progress never inferred from time; forecasts suppressed without evidence

`__tests__/simulation.test.ts` runs a **fourteen-day fixture** through the real
pipeline. It deliberately contains late wake-ups, a missing wake log, a rest day,
missed routines, partial and over-target counts, a missed study slot, a manually
logged one, spontaneous study, a week that hits the gym target and one that does
not, periodic practice done fully and half-done, recurring and overdue tasks, and
revisions — then asserts every derived number against the raw records.

---

## Production build

```bash
npx expo prebuild            # generate native projects
eas build --platform android
eas build --platform ios
```

Before shipping: set the bundle identifier in `app.json`, replace the icon and
splash assets, and re-run `tools/firebase-setup.mjs` against the production
project.

---

## Renaming the app

The product name lives in exactly one place: `src/constants/app.ts`.

```ts
export const APP_NAME = 'DayFlow';
```

Change it there and every user-visible occurrence follows. The only other places
the name appears are `app.json` (store listing, scheme, bundle id) and this README.

---

## Known limitations

- **Offline:** Firestore's React Native build has no on-disk cache, so cold-start
  offline reads are served by an AsyncStorage snapshot layer (`services/firebase/cache.ts`)
  covering routines, categories, subjects, timetable, today's tasks and logs, and a
  90-day summary window. Writes made offline are queued by the SDK and sync on
  reconnect. Older history is not available offline.
- **Notifications** require a development build; they do not fire in Expo Go.
- **Topics** are optional and currently tracked as status only — they do not roll
  up into chapter progress automatically.
- **Numeric routines** are modelled and storable but have no dedicated charting
  screen yet.
- **Google Sign-In** is not wired up; the auth layer is structured so it can be
  added without touching anything else.
- The weekly review stores subjective answers; it does not yet diff two arbitrary
  weeks side by side beyond the previous one.

---

## Roadmap

Deliberately not built yet, but the architecture leaves room:

AI day planner and study assistant · natural-language quick add · Google/Apple
Calendar sync · Google Fit / Apple Health · home-screen and lock-screen widgets ·
voice logging · exam planner · smarter timetable generation · deadline forecasting
· desktop dashboard · spreadsheet import · achievements.

Any future AI layer must operate on the structured records above. It must never
invent activity or analytics.
