import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarColors, border, colors, fonts, radius } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { BackIcon, CheckIcon, CloseIcon } from './icons';

// ─── Layout ─────────────────────────────────────────────────────

export function Screen({
  children,
  footer,
  scroll = true,
  style,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.screenInner, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[s.screenInner, { flex: 1 }, style]}>{children}</View>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function TopBar({
  onBack,
  close,
  title,
  right,
}: {
  onBack?: () => void;
  close?: boolean;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <View style={s.topBar}>
      {onBack ? (
        <IconButton label={close ? 'Close' : 'Back'} onPress={onBack}>
          {close ? <CloseIcon size={18} /> : <BackIcon size={20} />}
        </IconButton>
      ) : (
        <View style={{ width: 44 }} />
      )}
      {title ? <Text style={s.topTitle}>{title}</Text> : null}
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Progress({ step, of }: { step: number; of: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: of }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === step ? 28 : 12,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === step ? colors.ink : colors.mute,
          }}
        />
      ))}
    </View>
  );
}

// ─── Type ───────────────────────────────────────────────────────

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.body, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.label, style]}>{children}</Text>;
}

// ─── Sticker: a card with a hard offset shadow ──────────────────

export function Sticker({
  children,
  color = colors.white,
  shadow = colors.ink,
  offset = 5,
  rounded = radius.lg,
  rotate,
  style,
  innerStyle,
}: {
  children: ReactNode;
  color?: string;
  shadow?: string | null;
  offset?: number;
  rounded?: number;
  rotate?: number;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { paddingRight: shadow ? offset : 0, paddingBottom: shadow ? offset : 0 },
        rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null,
        style,
      ]}>
      {shadow ? (
        <View
          style={{
            position: 'absolute',
            left: offset,
            top: offset,
            right: 0,
            bottom: 0,
            borderRadius: rounded,
            backgroundColor: shadow,
          }}
        />
      ) : null}
      <View
        style={[
          { backgroundColor: color, borderWidth: border, borderColor: colors.ink, borderRadius: rounded },
          innerStyle,
        ]}>
        {children}
      </View>
    </View>
  );
}

// ─── Buttons ────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'dashed' | 'link';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const inactive = disabled || loading;
  const press = () => {
    if (inactive) return;
    if (variant === 'primary') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  if (variant === 'link') {
    return (
      <Pressable accessibilityRole="button" onPress={press} style={s.linkBtn} hitSlop={8}>
        <Text style={s.linkText}>{label}</Text>
      </Pressable>
    );
  }
  if (variant === 'dashed') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={press}
        style={({ pressed }) => [s.dashed, pressed && { backgroundColor: colors.muteFill }]}>
        {icon}
        <Text style={s.dashedText}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={press}
      style={({ pressed }) => [s.primaryWrap, pressed && !inactive && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
      <View style={[s.primaryShadow, inactive && { backgroundColor: colors.mute }]} />
      <View style={[s.primary, inactive && { backgroundColor: colors.inkSoft }]}>
        {loading ? <ActivityIndicator color={colors.lime} /> : <Text style={s.primaryText}>{label}</Text>}
      </View>
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.iconBtn}>
      {children}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  selectedColor = colors.ink,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  selectedColor?: string;
}) {
  const dark = selected && selectedColor === colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[s.chip, { backgroundColor: selected ? selectedColor : colors.white }]}>
      <Text style={[s.chipText, dark && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, dark, color }: { label: string; dark?: boolean; color?: string }) {
  return (
    <View style={[s.tag, { backgroundColor: color ?? (dark ? colors.ink : colors.white) }]}>
      <Text style={[s.tagText, dark && { color: color ? colors.ink : colors.white }]}>{label}</Text>
    </View>
  );
}

export function Checkbox({ checked, round }: { checked: boolean; round?: boolean }) {
  return (
    <View
      style={[
        s.check,
        round && { borderRadius: 13 },
        { backgroundColor: checked && !round ? colors.lime : colors.white },
      ]}>
      {checked ? (
        round ? (
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink }} />
        ) : (
          <CheckIcon size={15} />
        )
      ) : null}
    </View>
  );
}

// ─── Inputs ─────────────────────────────────────────────────────

export function Field({ big, style, ...props }: TextInputProps & { big?: boolean }) {
  return (
    <Sticker shadow={colors.lime} offset={4} rounded={radius.md}>
      <TextInput
        placeholderTextColor="#8B82A3"
        {...props}
        style={[s.field, big && s.fieldBig, style]}
      />
    </Sticker>
  );
}

// ─── People ─────────────────────────────────────────────────────

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return avatarColors[Math.abs(h) % avatarColors.length];
}

export function Avatar({ profile, size = 40, faded }: { profile?: Profile | null; size?: number; faded?: boolean }) {
  const name = profile?.display_name ?? '?';
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2,
    borderColor: colors.ink,
    opacity: faded ? 0.5 : 1,
  };
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={box} contentFit="cover" accessibilityLabel={name} />;
  }
  return (
    <View style={[box, { backgroundColor: colorFor(profile?.id ?? name), alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.42, color: colors.ink }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function AvatarStack({ people, size = 30 }: { people: (Profile | null | undefined)[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.slice(0, 5).map((p, i) => (
        <View key={p?.id ?? i} style={{ marginLeft: i === 0 ? 0 : -size / 3 }}>
          <Avatar profile={p} size={size} />
        </View>
      ))}
    </View>
  );
}

export function namesIn(people: (Profile | null | undefined)[], me?: string | null) {
  const names = people.map((p) => (p?.id === me ? 'You' : p?.display_name ?? 'Someone'));
  if (names.length === 0) return 'Nobody yet';
  if (names.length === 1) return `${names[0]} is in`;
  if (names.length === 2) return `${names[0]} + ${names[1]} are in`;
  return `${names[0]} and ${names.length - 1} others are in`;
}

// ─── Sheet ──────────────────────────────────────────────────────

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.grabber} />
        {children}
      </SafeAreaView>
    </Modal>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  screenInner: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  topTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, letterSpacing: -1.2, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.inkSoft },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  primaryWrap: { height: 64, paddingRight: 4, paddingBottom: 4 },
  primaryShadow: {
    position: 'absolute',
    left: 4,
    top: 4,
    right: 0,
    bottom: 0,
    borderRadius: radius.md,
    backgroundColor: colors.pink,
  },
  primary: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.lime },
  dashed: {
    minHeight: 48,
    borderWidth: border,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  dashedText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: border,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: colors.ink,
    alignSelf: 'flex-start',
  },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: border,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.ink,
  },
  fieldBig: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 26 },
  scrim: { flex: 1, backgroundColor: colors.dim },
  sheet: {
    backgroundColor: colors.ground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: border,
    borderBottomWidth: 0,
    borderColor: colors.ink,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 48, height: 5, borderRadius: 3, backgroundColor: colors.mute, marginBottom: 12 },
});
