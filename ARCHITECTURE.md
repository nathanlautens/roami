# Roami architecture

How the app loads, caches and updates data, and how it ships. For setup see [README.md](README.md); for releasing see [RELEASE.md](RELEASE.md).

## Shape

```
src/app/            Screens (Expo Router). _layout.tsx files are navigators.
src/components/     UI building blocks (ui.tsx), cards, sheets.
src/lib/            Everything that isn't a screen:
  supabase.ts         The Supabase client (session stored encrypted: secure-session.ts)
  auth.tsx            Session + your profile (cached on the phone)
  query.ts            The shared data cache (TanStack Query)
  realtime.ts         The one live connection that keeps the cache fresh
  data.ts             Data hooks: useFeed, useFriends, useCircles, useRoam, useArchive
  open-roams.ts       Open Roams ("find a night") hooks and buzzer rules
  schemas.ts          Zod schemas for every form (limits match the database)
  storage.ts          On-device settings (cached key-value store)
  calendar.ts, push.ts, updates.ts, biometric.ts
supabase/migrations Schema, privacy rules (RLS), RPCs, cron jobs, indexes
supabase/tests      PGlite tests for the database (npm test)
```

The database is the source of truth for every rule (who can see what, limits, the buzzer). The app calls RPCs for anything with rules and reads tables directly where RLS is enough.

## Data flow

```
screen ──useFeed()──► useLoader(key, fetcher, placeholder, tables)
                         │
                         ▼
                   TanStack Query cache  ◄── invalidate by table ── realtime.ts
                         │                                          ▲
                         ▼                                          │
                   Supabase (PostgREST)              one channel: postgres_changes
```

- **One cache.** `useLoader` is a thin wrapper over `useQuery`. Screens asking for the same key (e.g. `['friends', userId]`) share one request and one copy. Data is fresh for 30s; after that it's refetched when a screen shows it.
- **One live connection.** `useRealtimeSync` (mounted in the root layout) opens a single channel listening to every table in the `supabase_realtime` publication. A change marks the queries that declared that table (`meta.tables`) as stale. Changes are coalesced over 250ms, so a burst causes one refetch.
- **Only what's on screen refetches.** Hidden screens unsubscribe (`subscribed: useIsFocused()`) and catch up when you return.
- **Background and offline.** The socket closes in the background; on resume, all live queries are invalidated (missed changes). Returning to the app counts as focus. Offline, queries pause and resume on reconnect (`expo-network`).
- **Your own changes** usually arrive via realtime, but screens also call `invalidate('feed')` etc. after a mutation so they don't depend on the socket. Tables outside the publication (circles) must always be invalidated explicitly.

Adding a data hook: give it a key that includes `userId` (or the record id), list the tables it reads, and invalidate it after mutations realtime won't report.

## Forms

Forms use react-hook-form with a Zod schema from `src/lib/schemas.ts` via `zodResolver`. Text inputs go through `FormField` (`components/ui.tsx`), which binds the input and shows its validation message underneath; chips and checkboxes call `setValue`. Read values with `useWatch`, not `watch` (the React Compiler can't optimise components that call `watch`), and call `handleSubmit` inside the press handler rather than during render. Server errors are still shown as alerts. Rules that need loaded data (e.g. "pick at least one friend") are checked in the submit handler.

`metro.config.js` swaps Zod's 64-language locale bundle for English only.

## Startup

1. Fonts load, and the Supabase session is read from encrypted storage.
2. If this phone has your profile cached, the app opens immediately and refreshes the profile in the background. A failed profile load never counts as "no profile", so being offline can't send you back to onboarding.
3. Face ID covers the app if unlock is on.

## Shipping

- **EAS Build** profiles (`eas.json`) each have a channel and an EAS environment (which supplies `EXPO_PUBLIC_SUPABASE_*`).
- **EAS Update** ships JavaScript fixes without a store review. `runtimeVersion.policy = fingerprint` means an update only reaches builds with the same native code. Builds check on launch and when returning to the foreground (`updates.ts`); updates apply on the next start.
- **Crash recovery.** The root `ErrorBoundary` shows a Try again / Restart screen instead of a blank app.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, lint and every database test.

## Next steps (not done yet; each needs an account or a decision)

- **Crash reporting** (e.g. Sentry's Expo plugin): needs an account and DSN. The ErrorBoundary is the place to report from.
- **Generated database types** (`supabase gen types typescript`) to replace the `as unknown as` casts in `data.ts`: needs access to the live project.
- **Universal links / App Links** for invite links (`roami://add/…` isn't tappable in most messengers): needs a domain serving `apple-app-site-association` and `assetlinks.json`.
- **Realtime at scale.** `postgres_changes` checks RLS for every subscriber on every change. Fine for now; past a few thousand concurrent users, move to Realtime Broadcast sent from database triggers.
- **Feed in one round trip** (an RPC returning your Roams with who's in), instead of two dependent queries.
