/**
 * Testing switch: skip login entirely.
 *
 * false (release): sign up with an email code once, then Face ID / fingerprint.
 * true (testing only): each phone is signed in anonymously in the background.
 * Needs "Allow anonymous sign-ins" on in Supabase. Accounts are lost if the app is deleted.
 */
export const SKIP_LOGIN = false;

/**
 * App Store / Play Store reviewers can't receive email codes, so this one
 * account signs in with a password instead. Create it in Supabase:
 * Authentication -> Users -> Add user -> Create new user (tick "Auto confirm").
 * Give the email + password to the stores in their "App Review" / "App access" sections.
 */
export const REVIEW_EMAIL = 'review@roami.test';
