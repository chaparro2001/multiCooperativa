import { Redirect } from 'expo-router';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { AssistantModelSection } from '@/features/assistant/model-settings-section';
import { canChooseAssistantModel } from '@/features/assistant/model-settings';
import { Screen } from '@/ui/screen';

/** Administrator sub-page of the settings; the API still enforces the permission. */
export default function SettingsAssistantModelSectionScreen() {
  const { permissions } = useActiveCooperative();
  if (!canChooseAssistantModel(permissions?.permissions)) return <Redirect href="/settings" />;
  return (
    <Screen testID="settings-assistant-screen">
      <AssistantModelSection />
    </Screen>
  );
}
