# Roami

Plans, minus the admin. Throw out a Roam, see who bites.

An iOS + Android app (no web) built with Expo SDK 58, Expo Router and Supabase.

## One-time setup

### 1. Create the database
In the [Supabase dashboard](https://supabase.com/dashboard) open **SQL Editor → New query**, paste the whole of
`supabase/migrations/20261014200000_initial_schema.sql`, and press **Run**.

This creates the tables, the privacy rules (row level security), the functions the app calls, live updates, and the `avatars` photo bucket.

**Releasing to the App Store and Google Play: see [RELEASE.md](RELEASE.md).**

### 2. Login
Release builds use an **email code once, then Face ID / fingerprint** (see RELEASE.md for the Supabase email setup).

### 2a. Test friends (optional)
Paste `supabase/migrations/20261014230000_mock_friends.sql` into **SQL Editor** and **Run**. Then in the app (dev builds / Expo Go only) tap **Load test friends**, on the Friends screen or the empty home feed. You get 10 mock friends split across 2 circles, 2 Roams waiting for you, and mock friends who answer your Roams instantly. **Remove test friends** clears them.

### 2b. Open Roams + the buzzer
Paste `supabase/migrations/20261015000000_open_roams.sql` into **SQL Editor** and **Run** (after the mock friends SQL). In the app: **+ → Find a night** to pick nights, invite people and set a buzzer. At the buzzer the top night locks into a normal Roam. In dev builds, **Start a test vote** (Friends → Test mode) has a test friend start one with a 3-minute buzzer.

### 3. Run it on your phone
First, give the app your Supabase settings (they're kept out of the code):
```bash
cp .env.example .env   # then fill in the URL and publishable key from Supabase -> Project Settings -> API Keys
```
```bash
npm install
npm start
```
Scan the QR code with the **Expo Go** app (iOS) or the camera.

Push notifications and calendar sync need a **development build** (or the TestFlight / Play build) instead of Expo Go:
```bash
npx eas-cli@latest build --profile development --platform ios     # or android
```

## What's in here

| Path | What it is |
| --- | --- |
| `src/app/(auth)` | Welcome + email code login (then Face ID / fingerprint) |
| `src/app/(onboarding)/setup.tsx` | Display name + profile photo |
| `src/app/(app)/index.tsx` | The feed: buzzing, you're in, up for grabs, your Roams, waiting on you |
| `src/app/(app)/archive.tsx` | Past Roams, by month |
| `src/app/(app)/open/[id].tsx` | Open Roams: vote on nights and vibes before the buzzer |
| `src/app/(app)/send.tsx` | Send a Roam: circles, what, vibe, when, where, spots (or find a night) |
| `src/app/(app)/roam/[id].tsx` | One Roam: respond, calendar check, bring someone, can't make it, take the wheel, report / block |
| `src/app/(app)/friends.tsx` | Friend codes, requests, invite link, block |
| `src/app/(app)/circles` | Private circles with "last roamed" |
| `src/lib` | Supabase client, auth, data hooks, Roam rules, calendar sync, push |
| `store/` | Store screenshots (`npm run screenshots`) |
| `supabase/migrations` | The database schema |
| `supabase/tests` | Tests for the schema's rules (`npm test`) |

## Rules the app follows (from the spec)

- Crews are private to their owner. Invitees see who's **In**, never who said Maybe or Can't (only the host sees those).
- A Maybe turns into a Can't an hour before the start.
- If the host can't make it and others are In, the Roam goes **up for grabs** and anyone who's In can take it over. If nobody's In, it's called off.
- Saying In to something that overlaps a Roam you're already In on asks which one to skip.
- Max 5 active Roams per host, up to 7 days ahead, optional 1–20 spots.

## Checks
```bash
npm run typecheck
npx expo lint
npm test
```
