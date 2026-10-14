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
  const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const body = await (await fetch(asset.uri)).arrayBuffer();

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
  if (error) throw error;

  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
