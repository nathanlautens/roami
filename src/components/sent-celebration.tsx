import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { clearCelebration, useCelebration } from '@/lib/celebrate';
import { colors, fonts } from '@/lib/theme';
import { Sticker } from './ui';

const CONFETTI_COLORS = [colors.lime, colors.pink, colors.yellow, colors.lilac, colors.white, '#7EC8FF'];
const SHOW_FOR_MS = 2200;

type Piece = { dx: number; up: number; down: number; spin: number; color: string; w: number; h: number; round: boolean };

function makePieces(width: number): Piece[] {
  return Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 90 + Math.random() * (width * 0.45);
    return {
      dx: Math.cos(angle) * reach,
      up: -Math.abs(Math.sin(angle)) * (120 + Math.random() * 120) - 40,
      down: 260 + Math.random() * 260,
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 8 + Math.random() * 8,
      h: 10 + Math.random() * 10,
      round: i % 3 === 0,
    };
  });
}

/** "Roam sent!" pops up over the home screen, throws confetti, then gets out of the way. */
export function SentCelebration() {
  const sent = useCelebration();
  if (!sent) return null;
  // A fresh key per send replays the animation.
  return <Burst key={sent.id} what={sent.what} count={sent.count} />;
}

function Burst({ what, count }: { what: string; count: number }) {
  const { width } = useWindowDimensions();
  const [pieces] = useState(() => makePieces(width));
  const [pop] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => clearCelebration());
    }, SHOW_FOR_MS);
    return () => clearTimeout(t);
  }, [burst, fade, pop]);

  const close = () =>
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => clearCelebration());

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const rotate = pop.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '-3deg'] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Roam sent. Tap to close."
          style={{ flex: 1, backgroundColor: 'rgba(23, 18, 31, 0.45)', alignItems: 'center', justifyContent: 'center' }}>
          {/* Confetti */}
          <View pointerEvents="none" style={{ position: 'absolute', left: width / 2, top: '45%' }}>
            {pieces.map((p, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  width: p.w,
                  height: p.round ? p.w : p.h,
                  borderRadius: p.round ? p.w / 2 : 2,
                  backgroundColor: p.color,
                  borderWidth: 1.5,
                  borderColor: colors.ink,
                  opacity: burst.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, p.up, p.down] }) },
                    { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
                  ],
                }}
              />
            ))}
          </View>

          {/* The sticker */}
          <Animated.View style={{ transform: [{ scale }, { rotate }], width: '78%' }}>
            <Sticker color={colors.lime} offset={6} rounded={28} innerStyle={{ padding: 22, gap: 8, alignItems: 'center' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -1.2, color: colors.ink }}>
                Roam sent!
              </Text>
              <Text numberOfLines={2} style={{ fontFamily: fonts.displayBold, fontSize: 20, lineHeight: 24, color: colors.ink, textAlign: 'center' }}>
                “{what}”
              </Text>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.inkSoft, textAlign: 'center' }}>
                Out to {count} {count === 1 ? 'person' : 'people'}. Let's see who bites.
              </Text>
            </Sticker>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
