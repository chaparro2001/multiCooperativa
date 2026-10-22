import { Redirect } from 'expo-router';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { AppearanceSection } from '@/features/branding/appearance-section';
import { canEditBranding } from '@/features/branding/brand-color';
import { Screen } from '@/ui/screen';

/** Administrator sub-page of the settings; the API still enforces the permission. */
export default function SettingsAppearanceSectionScreen() {
  const { permissions } = useActiveCooperative();
  if (!canEditBranding(permissions?.permissions)) return <Redirect href="/settings" />;
  return (
    <Screen testID="settings-appearance-screen">
      <AppearanceSection />
    </Screen>
  );
}
