import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { secureSessionStorage } from './secure-session';

// Settings come from the environment, never from the code:
//  - on your computer: a `.env` file in the project folder (see `.env.example`; it's git-ignored)
//  - in EAS builds: EAS environment variables (see RELEASE.md)
// Only ever use the publishable key here. Never a secret / service_role key.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (for EAS builds, set them as EAS environment variables).',
  );
}
if (/^sb_secret_|service_role/.test(supabasePublishableKey)) {
  throw new Error('That is a secret Supabase key. Use the publishable key (sb_publishable_…) in the app.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: secureSessionStorage, // encrypted, key in the keychain (see secure-session.ts)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
