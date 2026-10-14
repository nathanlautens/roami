# Roami

Plans, minus the admin. Throw out a Roam, see who bites.

An iOS + Android app (no web) built with Expo SDK 57, Expo Router and Supabase.

## One-time setup

### 1. Create the database
In the [Supabase dashboard](https://supabase.com/dashboard/project/iounsooetwcgfruvnylj) open **SQL Editor → New query**, paste the whole of
`supabase/migrations/20261014200000_initial_schema.sql`, and press **Run**.

This creates the tables, the privacy rules (row level security), the functions the app calls, live updates, and the `avatars` photo bucket.

### 2. Turn on phone login with Twilio
In the Supabase dashboard go to **Authentication → Sign In / Providers → Phone**:

1. Enable the Phone provider.
2. SMS provider: **Twilio**.
3. Paste your Twilio **Account SID**, **Auth Token**, and the **Message Service SID** (or Twilio phone number) that sends the texts.
4. Save.

The Twilio token lives only in Supabase. It must never go in this repo or the app.

### 3. Run it on your phone
```bash
npm install
npx expo start
```
Scan the QR code with the **Expo Go** app (iOS) or the camera.

Push notifications and some native features need a **development build** instead of Expo Go, especially on Android:
```bash
npx eas-cli@latest build --profile development --platform ios     # or android
```

## What's in here

| Path | What it is |
| --- | --- |
| `src/app/(auth)` | Welcome + phone number / SMS code login |
| `src/app/(onboarding)/setup.tsx` | Display name + profile photo |
| `src/app/(app)/index.tsx` | The feed: waiting on you, up for grabs, your Roams |
| `src/app/(app)/send.tsx` | Send a Roam: crews, what, vibe, when, where, spots |
| `src/app/(app)/roam/[id].tsx` | One Roam: respond, double-booked check, bring someone, can't make it, take the wheel |
| `src/app/(app)/friends.tsx` | Find friends from contacts, requests, invite link |
| `src/app/(app)/crews` | Private crews with "last roamed" |
| `src/lib` | Supabase client, auth, data hooks, Roam rules |
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
```
