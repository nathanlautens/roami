import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts } from '@/lib/theme';
import { CameraIcon, PlusIcon } from './icons';
import { Avatar, Button, Field, Label, Sticker } from './ui';

/** Photo + display name. Used in onboarding and on the profile screen. */
export function ProfileForm({ cta, onSaved }: { cta: string; onSaved?: () => void }) {
  const { userId, profile, refreshProfile, session } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const preview = { id: userId ?? 'me', display_name: name || '?', avatar_url: avatarUrl };
  const phone = session?.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : null;

  async function pickPhoto() {
    if (!userId) return;
    try {
      setUploading(true);
      const url = await pickAndUploadAvatar(userId);
      if (url) setAvatarUrl(url);
    } catch {
      Alert.alert("Couldn't upload that", 'Try a different photo?');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!userId || !trimmed) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed.slice(0, 30), avatar_url: avatarUrl })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't save", 'Something went sideways. Try again?');
      return;
    }
    await refreshProfile();
    onSaved?.();
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', marginVertical: 28 }}>
        <Pressable
          onPress={pickPhoto}
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? 'Change your profile photo' : 'Add a profile photo'}
          style={{
            width: 148,
            height: 148,
            borderRadius: 74,
            borderWidth: border,
            borderStyle: avatarUrl ? 'solid' : 'dashed',
            borderColor: colors.ink,
            backgroundColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {avatarUrl ? (
            <Avatar profile={preview} size={142} />
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <CameraIcon size={34} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>
                {uploading ? 'Uploading…' : 'Add a pic'}
              </Text>
            </View>
          )}
          <View
            style={{
              position: 'absolute',
              right: 2,
              bottom: 6,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.pink,
              borderWidth: border,
              borderColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <PlusIcon size={18} />
          </View>
        </Pressable>
      </View>

      <Label>Display name</Label>
      <View style={{ marginTop: 8 }}>
        <Field
          big
          value={name}
          onChangeText={setName}
          placeholder="What do your friends call you?"
          maxLength={30}
          autoCapitalize="words"
          accessibilityLabel="Display name"
          returnKeyType="done"
        />
      </View>
      {phone ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 10 }}>
          Linked to {phone}. Friends who have your number will find you.
        </Text>
      ) : null}

      <Sticker shadow={null} style={{ marginTop: 24 }} innerStyle={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar profile={preview} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.inkSoft }}>PREVIEW</Text>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>
            {name.trim() || 'You'} is free tonight
          </Text>
        </View>
      </Sticker>

      <View style={{ marginTop: 'auto', paddingTop: 24 }}>
        <Button label={cta} onPress={save} loading={saving} disabled={!name.trim() || uploading} />
      </View>
    </View>
  );
}
