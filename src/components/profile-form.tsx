import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { pickAndUploadAvatar, removeOldPhotos } from '@/lib/avatar';
import { profileSchema } from '@/lib/schemas';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts } from '@/lib/theme';
import { CameraIcon, PlusIcon } from './icons';
import { Avatar, Button, FormField, Label, Sticker } from './ui';

export function ProfileForm({ cta, onSaved }: { cta: string; onSaved?: () => void }) {
  const { userId, profile, refreshProfile } = useAuth();
  const { control, handleSubmit, setValue, formState } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: profile?.display_name ?? '', avatarUrl: profile?.avatar_url ?? null },
  });
  const [name, avatarUrl] = useWatch({ control, name: ['displayName', 'avatarUrl'] });
  const [uploading, setUploading] = useState(false);

  const preview = { id: userId ?? 'me', display_name: name || '?', avatar_url: avatarUrl };

  async function pickPhoto() {
    if (!userId) return;
    try {
      setUploading(true);
      const url = await pickAndUploadAvatar(userId);
      if (url) setValue('avatarUrl', url);
    } catch (e) {
      const reason = (e as { message?: string })?.message;
      Alert.alert("Couldn't upload that", reason ? `Try a different photo? (${reason})` : 'Try a different photo?');
    } finally {
      setUploading(false);
    }
  }

  const save = () =>
    handleSubmit(async ({ displayName, avatarUrl }) => {
      if (!userId) return;
      const { error } = await supabase.from('profiles').update({ display_name: displayName, avatar_url: avatarUrl }).eq('id', userId);
      if (error) return Alert.alert("Couldn't save", 'Something went sideways. Try again?');
      await refreshProfile();
      removeOldPhotos(userId, avatarUrl).catch(() => {});
      onSaved?.();
    })();

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
        <FormField
          control={control}
          name="displayName"
          big
          placeholder="What do your friends call you?"
          maxLength={30}
          autoCapitalize="words"
          accessibilityLabel="Display name"
          returnKeyType="done"
        />
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 10 }}>
        This is how friends see you. Share your friend code so they can add you.
      </Text>

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
        <Button label={cta} onPress={save} loading={formState.isSubmitting} disabled={!name.trim() || uploading} />
      </View>
    </View>
  );
}
