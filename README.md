# Roami

Plans, minus the admin. Throw out a Roam, see who bites.

An iOS + Android app (no web) built with Expo SDK 57, Expo Router and Supabase.

## One-time setup

### 1. Create the database
In the [Supabase dashboard](https://supabase.com/dashboard/project/iounsooetwcgfruvnylj) open **SQL Editor → New query**, paste the whole of
`supabase/migrations/20261014200000_initial_schema.sql`, and press **Run**.

This creates the tables, the privacy rules (row level security), the functions the app calls, live updates, and the `avatars` photo bucket.

**Releasing to the App Store and Google Play: see [RELEASE.md](RELEASE.md).**

### 2. Login
Release builds use an **email code once, then Face ID / fingerprint** (see RELEASE.md for the Supabase email setup).

### 2-old. Testing mode: no login (off by default)
Set `SKIP_LOGIN = true` in `src/lib/config.ts` to skip login. Each phone is signed in anonymously in the background, then asked for a name and photo. Nothing else changes: privacy rules and data work exactly as with phone login.

One switch in Supabase: **Authentication → Sign In / Providers → Allow anonymous sign-ins → on → Save**.

To add friends in testing mode, use the **friend code** on the Friends screen (contacts matching needs phone login).

### 2a. Test friends (optional)
Paste `supabase/migrations/20261014230000_mock_friends.sql` into **SQL Editor** and **Run**. Then in the app (dev builds / Expo Go only) tap **Load test friends**, on the Friends screen or the empty home feed. You get 10 mock friends split across 2 circles, 2 Roams waiting for you, and mock friends who answer your Roams instantly. **Remove test friends** clears them.

### 2b. Open Roams + the buzzer
Paste `supabase/migrations/20261015000000_open_roams.sql` into **SQL Editor** and **Run** (after the mock friends SQL). In the app: **+ → Find a night** to pick nights, invite people and set a buzzer. At the buzzer the top night locks into a normal Roam. In dev builds, **Start a test vote** (Friends → Test mode) has a test friend start one with a 3-minute buzzer.

### 2c. Later: turn on phone login (free, no SMS provider)
Set `SKIP_LOGIN = false` in `src/lib/config.ts`, then:

While testing, login codes aren't texted. They're saved to a table you can read in the dashboard.

1. **SQL Editor → New query**: paste the whole of `supabase/migrations/20261014210000_dev_sms_hook.sql` and **Run**.
2. **Authentication → Sign In / Providers → Phone**: switch it on, with phone signups allowed.
3. **Authentication → Hooks → Send SMS hook**: choose **Postgres**, schema `public`, function `send_sms_hook`, and enable it.
4. In the app, enter a phone number. Then open **Table Editor → dev_sms_codes** to find the 6-digit code. Codes also appear in **Logs → Postgres**.

Friends testing the app can't see the table, so you'll need to send them their code.
Before real users: disable the hook and connect a real SMS provider (e.g. Twilio Verify) under the Phone provider settings.

### 3. Run it on your phone
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
| `supabase/tests` | Tests for the schema's rules (`npm run test:db`) |

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
npm run test:db
npm run test:sms-hook
npm run test:mock
npm run test:open
npm run test:release
npm run test:push
```
