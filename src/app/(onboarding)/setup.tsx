import { Body, H1, Progress, Screen, TopBar } from '@/components/ui';
import { ProfileForm } from '@/components/profile-form';
import { useAuth } from '@/lib/auth';

export default function ProfileSetup() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <TopBar onBack={signOut} right={<Progress step={1} of={3} />} />
      <H1 style={{ marginTop: 28, marginBottom: 10 }}>Who's this hottie?</H1>
      <Body>This is how you'll show up on every Roam.</Body>
      {/* Once saved, the app guard swaps you into the main app, which nudges you to find friends. */}
      <ProfileForm cta="Looking good, next" />
    </Screen>
  );
}
