import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useBiometrics } from '@/auth/biometrics';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { AppearanceSection } from '@/features/branding/appearance-section';
import { canEditBranding } from '@/features/branding/brand-color';
import { AssistantModelSection } from '@/features/assistant/model-settings-section';
import { canChooseAssistantModel } from '@/features/assistant/model-settings';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { me, cooperative, permissions } = useActiveCooperative();
  const { signOut } = useSession();
  const biometrics = useBiometrics();
  const [biometricsError, setBiometricsError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function toggleBiometrics(value: boolean) {
    setBiometricsError(null);
    const changed = await biometrics.setEnabled(value);
    if (!changed) setBiometricsError(t('auth.lock.failed'));
  }

  return (
    <Screen testID="settings-screen">
      <View style={styles.section}>
        <Text style={styles.name}>{me?.name}</Text>
        <Text style={styles.detail}>{me?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.cooperative')}</Text>
        <Text style={styles.name}>{cooperative?.cooperativeName}</Text>
        {(me?.memberships.length ?? 0) > 1 && (
          <Button
            title={t('settings.switchCooperative')}
            variant="secondary"
            onPress={() => router.push('/select-cooperative')}
            testID="switch-cooperative"
          />
        )}
      </View>

      {/* US-ACC-04: without biometrics set up on the device, the option is not offered. */}
      {biometrics.available && (
        <View style={[styles.section, styles.row]}>
          <Text style={styles.name}>{t('settings.biometrics')}</Text>
          <Switch
            value={biometrics.enabled}
            onValueChange={toggleBiometrics}
            accessibilityLabel={t('settings.biometrics')}
            testID="biometrics-switch"
          />
        </View>
      )}
      {biometricsError && <ErrorText>{biometricsError}</ErrorText>}

      {/* US-ACC-14: only the administrator sees it; the API enforces it. */}
      {canEditBranding(permissions?.permissions) && <AppearanceSection />}

      {/* US-AI-07: only the administrator sees it; the API enforces it. */}
      {canChooseAssistantModel(permissions?.permissions) && <AssistantModelSection />}

      <Button
        title={t('settings.signOut')}
        variant="danger"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
        testID="sign-out"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
});
