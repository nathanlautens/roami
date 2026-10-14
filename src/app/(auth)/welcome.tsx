import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarStack, Body, Button, H1, Sticker } from '@/components/ui';
import { colors, fonts } from '@/lib/theme';

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 64, letterSpacing: -2.5, color: colors.ink }}>
          roami<Text style={{ color: colors.pink }}>.</Text>
        </Text>

        <View style={{ height: 300, marginTop: 28 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Sticker color={colors.lime} rotate={-6} rounded={22} style={{ position: 'absolute', left: 4, top: 8, width: 230 }} innerStyle={{ padding: 16 }}>
            <Text style={tiny}>TONIGHT · 7PM</Text>
            <Text style={card}>Pub quiz, I'm carrying</Text>
          </Sticker>
          <Sticker color={colors.pink} rotate={5} rounded={22} style={{ position: 'absolute', right: 0, top: 120, width: 200 }} innerStyle={{ padding: 14 }}>
            <Text style={tiny}>RIGHT NOW</Text>
            <Text style={card}>Someone feed me</Text>
          </Sticker>
          <Sticker rotate={-2} rounded={999} offset={4} style={{ position: 'absolute', left: 30, top: 228 }} innerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 16 }}>
            <AvatarStack
              people={[
                { id: 'a', display_name: 'J', avatar_url: null },
                { id: 'bb', display_name: 'S', avatar_url: null },
                { id: 'ccc', display_name: 'P', avatar_url: null },
              ]}
            />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>3 are in</Text>
          </Sticker>
        </View>

        <View style={{ marginTop: 'auto', gap: 14 }}>
          <H1 style={{ fontSize: 40, lineHeight: 42 }}>Plans,{'\n'}minus the admin.</H1>
          <Body style={{ fontSize: 17, marginBottom: 12 }}>
            Throw out a Roam, see who bites. No group-chat archaeology required.
          </Body>
          <Button label="Let's roam" onPress={() => router.push('/phone')} />
          <Button variant="link" label="Already roaming? Log in" onPress={() => router.push('/phone')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const tiny = { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink };
const card = { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 27, marginTop: 6, color: colors.ink };
