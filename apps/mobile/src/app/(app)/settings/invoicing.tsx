import { Redirect } from 'expo-router';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { InvoicingSettingsSection } from '@/features/invoicing/settings-section';
import { canEditInvoicingSettings } from '@/features/invoicing/attention';
import { Screen } from '@/ui/screen';

/** Administrator sub-page of the settings; the API still enforces the permission. */
export default function SettingsInvoicingSettingsSectionScreen() {
  const { permissions } = useActiveCooperative();
  if (!canEditInvoicingSettings(permissions?.permissions)) return <Redirect href="/settings" />;
  return (
    <Screen testID="settings-invoicing-screen">
      <InvoicingSettingsSection />
    </Screen>
  );
}
