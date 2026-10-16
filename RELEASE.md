# Releasing Roami

Plan: **friends first** (TestFlight on iPhone, Google Play closed testing on Android), **public later**.

Do the steps in order. Anything marked ⏳ involves waiting on Apple or Google, so start those first.

---

## 1. ⏳ Developer accounts (start today)

**Apple Developer Program**, $99/year
1. Go to developer.apple.com/programs/enroll and sign in with your Apple ID (two-factor authentication must be on).
2. Enrol as an **Individual**. The App Store will show your name as the seller.
3. Pay. Approval usually takes up to 48 hours.

**Google Play Console**, $25 one-off
1. Go to play.google.com/console/signup and choose a **Personal** account.
2. Pay and complete identity verification. This can take a few days.
3. New personal accounts must run a **closed test with at least 12 testers for 14 days in a row** before going public. Your friends are those testers, so this fits the friends-first plan.

---

## 2. Supabase

### 2a. Run the release SQL
1. **Database → Extensions**: enable **pg_cron** and **pg_net**. pg_cron runs the buzzer and push jobs every minute; pg_net lets the database send pushes.
2. **SQL Editor → New query**: paste all of `supabase/migrations/20261016210000_release_ready.sql` and **Run**.
3. New query again: paste all of `supabase/migrations/20261016220000_safety_and_push.sql` and **Run**.

The first file adds "Delete my account", the every-minute buzzer, and locks the test helpers so real users can't create fake friends.
To use test friends again while testing, run the `grant …` line at the bottom of that file.

The second adds **block and report** and **push notifications** sent from the server (new Roam, someone's in, plan changed or called off, friend requests, the buzzer, and "starting in 30"). Pushes wait until 8am if they'd land between midnight and 8am in that person's time zone, except "starting soon" and "called off".

**Reviewing reports:** Table Editor → `reports`. Set `status` to `actioned` or `dismissed` once you've dealt with one. To ban someone, delete them in Authentication → Users.

### 2b. ⏳ Email that actually reaches your friends
Supabase's built-in email only sends to members of your Supabase team, two an hour. Plug in a free email service:

1. Buy a domain if you don't have one (e.g. `roami.app` or similar, about £10/year).
2. Sign up at **resend.com** (free: 3,000 emails/month) and add your domain. Add the DNS records it shows you; verification takes minutes to a few hours.
3. In Resend, create an **API key**.
4. In Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key
   - Sender email: `hello@yourdomain`, sender name: `Roami`

### 2c. Send codes instead of links
**Authentication → Emails → Templates.** In **both** "Magic Link" and "Confirm signup", replace the body with:

```html
<h2>Your Roami code</h2>
<p>Type this into the app:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:6px">{{ .Token }}</p>
<p>It expires in an hour. Didn't ask for this? Ignore it.</p>
```

Subject: `Your Roami code: {{ .Token }}`

### 2d. Login settings
- **Authentication → Sign In / Providers → Email**: enabled.
- **Allow anonymous sign-ins**: turn **off** (the app no longer uses it).

### 2e. A login for the app reviewers
Reviewers can't receive your email codes, so the app lets one account use a password:
1. **Authentication → Users → Add user → Create new user**
2. Email `review@roami.test`, a strong password, tick **Auto confirm user**.
3. Open the app once with that account and set a name, so reviewers land on the home screen.

You'll paste this email and password into App Store Connect and Play Console later.

---

## 3. Privacy policy and support pages (5 minutes)

The stores need public links. They're already in the repo under `docs/`.

1. On GitHub: **nathanlautens/roami → Settings → Pages**.
2. Source: **Deploy from a branch**, branch **main**, folder **/docs**, then **Save**.
3. After a minute or two you'll have:
   - Support: `https://nathanlautens.github.io/roami/`
   - Privacy: `https://nathanlautens.github.io/roami/privacy.html`

Both pages list `admin@roami.com` as the contact. Change it in `docs/` if you'd rather use another address.

---

## 4. iPhone: TestFlight

On your Mac, in the `roami-v1` folder:

```bash
git pull && npm install
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
```

- Log in with the Expo account that owns the project.
- When it asks, **log in with your Apple ID** and let EAS create the certificates for you (say yes to everything).
- The build runs in the cloud and takes about 15–25 minutes. You get a link when it's done.

**Push on iPhone:** during that first build, say **yes** when EAS asks to set up a Push Notifications key. That's all iPhone needs.

Then send it to Apple:

```bash
npx eas-cli@latest submit --platform ios --latest
```

The first time, it creates the app in **App Store Connect** for you.

**In App Store Connect (appstoreconnect.apple.com) → Roami → TestFlight:**
1. **Test Information**: add a short description, your email, the privacy policy link, and under **Sign-in required** the reviewer email and password from step 2e.
2. **External Testing → + → New group** (e.g. "Friends"), then add the build.
3. The first external build goes through a quick **Beta App Review** (usually under a day).
4. Turn on the **Public link** and send it to your friends. They install **TestFlight** from the App Store, tap your link, and get Roami.

---

## 5. Android: Google Play closed testing

```bash
npx eas-cli@latest build --platform android --profile production
```

This makes an `.aab` file (about 15 minutes). Download it from the link EAS gives you.

**In Play Console (play.google.com/console):**
1. **Create app**: name **Roami**, App, Free.
2. **Set up your app** (the checklist on the dashboard):
   - Privacy policy: the GitHub Pages privacy link
   - App access: **Some functionality is restricted**, then add the reviewer email + password
   - Ads: **No**
   - Content rating: fill in the questionnaire (no violence, gambling, etc.; users can talk to each other)
   - Target audience: **18+** (simplest; avoids the families policies)
   - Data safety: see the answers below
3. **Testing → Closed testing → Create track**, then **Create release** and upload the `.aab`.
4. **Testers**: add your friends' Google account emails (a list or a Google Group). At least **12 people**.
5. Share the **opt-in link**. Each friend taps it, accepts, and installs from the Play Store.
6. Keep 12+ of them opted in for **14 days in a row**, then apply for production access from the dashboard.

**Push on Android** needs Firebase (free, one-off):
1. **console.firebase.google.com → Add project** "Roami" (Analytics off is fine).
2. **Add app → Android**, package name `com.nathanlautens.roami`. Download `google-services.json` and put it in the project root (next to `app.json`), then add `"googleServicesFile": "./google-services.json"` inside the `android` section of `app.json`. Commit it; this file isn't secret.
3. Firebase **Project settings → Service accounts → Generate new private key**. This one **is** secret: don't commit it.
4. Run `npx eas-cli@latest credentials`, choose Android → production → **Google Service Account → FCM V1**, and upload that key file.
5. Rebuild Android.

Later updates can be sent automatically with `npx eas-cli@latest submit --platform android` once you've set up a Google service account key (EAS walks you through it).

### Data safety answers
| Question | Answer |
|---|---|
| Collects or shares data? | Collects; doesn't share with third parties |
| Email address | Collected, for account management, required |
| Name | Collected, for app functionality, required |
| Photos | Collected (optional profile photo), for app functionality |
| User IDs | Collected, for account management |
| Other user-generated content | Collected (Roams, notes, votes, reports), for app functionality |
| Device or other IDs | Collected (push token), for app functionality |
| Calendar | Not collected: read and written on the phone only, never sent to Roami |
| Encrypted in transit | Yes |
| Users can request deletion | Yes (in the app: Profile → Delete my account) |

---

## 6. Every update after this

```bash
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios --latest
```

Build numbers go up automatically. New TestFlight builds reach your friends without another review for most updates.

---

## 7. Before going public (later)

- ✅ **Block and report** (Apple guideline 1.2). Check `reports` in the Table Editor regularly.
- ✅ **Push notifications** from the server.
- ✅ **Calendar**: Roams you're in go into your phone's calendar (Apple Calendar, or Google Calendar through the phone's accounts) and come out if you bail or it's cancelled. Profile → Calendar.
- **Store listing**: screenshots are ready (see below); add the description and keywords.
- Apple's **App Privacy** questions (same answers as the Data safety table).

### Screenshots
`store/out/ios/` (1290×2796, upload to the 6.9" iPhone slot) and `store/out/android/` (1080×1920, Play phone screenshots) are ready to upload.

They use design stand-ins of the app's screens. Before going public, swap in real captures: take screenshots on a phone from the TestFlight build, save them as `store/raw/feed.png`, `send.png`, `respond.png`, `vote.png`, `buzzer.png`, then run:

```bash
npm run screenshots
```

Any screen without a real capture keeps using the stand-in.

### Listing copy to start from
- **Name:** Roami
- **Subtitle (iOS, 30 chars):** Plans, minus the admin
- **Short description (Play, 80 chars):** Throw out a plan, see who bites. Last-minute plans with your people.
- **Description:**
  > Making plans shouldn't feel like work. Roami lets you throw out a "Roam" (drinks tonight, tacos Friday, a sunset walk) to exactly the friends you want, and see who's in.
  >
  > • Send a Roam in seconds to your circles or anyone you pick
  > • Friends tap In, Maybe or Next time. No 40-message group chats
  > • Can't pick a night? Start a vote, set the buzzer, and Roami locks in the winner
  > • Circles are private: only you know who's in which
  > • Gentle nudges when you haven't seen someone in a while
  >
  > Fun, fast, and zero guilt about saying no.
