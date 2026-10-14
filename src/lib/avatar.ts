import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

/** Lets you pick a square photo and uploads it. Returns its public URL, or null if cancelled. */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const contentType = asset.mimeType ?? 'image/jpeg';
  const ext = (contentType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  // A new file name every time, so we never need to overwrite (which would need extra storage permissions).
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  // Read the picked photo from the phone. `fetch(uri)` is unreliable for local files on Android.
  const body = await new File(asset.uri).arrayBuffer();

  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType });
  if (error) throw error;

  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
