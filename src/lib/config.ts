/**
 * Testing switch: skip phone login.
 *
 * When true, each phone is signed in anonymously in the background (no number,
 * no code), then goes straight to profile setup. Requires "Allow anonymous
 * sign-ins" to be on in Supabase: Authentication -> Sign In / Providers.
 *
 * Set back to false once phone login (SMS hook or provider) is working.
 */
export const SKIP_LOGIN = true;
