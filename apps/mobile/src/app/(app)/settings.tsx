import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useBiometrics } from '@/auth/biometrics';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { AppearanceSection } from '@/features/branding/appearance-section';
import { canEditBranding } from '@/features/branding/brand-color';
import { canEditInvoicingSettings } from '@/features/invoicing/attention';
import { InvoicingSettingsSection } from '@/features/invoicing/settings-section';
import { AssistantModelSection } from '@/features/assistant/model-settings-section';
import { canChooseAssistantModel } from '@/features/assistant/model-settings';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { Divider, Switch, Text, useTheme } from '@/ui/paper';
import { ErrorText, Screen } from '@/ui/screen';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { me, cooperative, permissions } = useActiveCooperative();
  const { signOut } = useSession();
  const { colors } = useTheme();
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
        <Text variant="titleMedium">{me?.name}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {me?.email}
        </Text>
      </View>
      <Divider />

      <View style={styles.section}>
        <Text variant="labelMedium" style={[styles.label, { color: colors.onSurfaceVariant }]}>
          {t('settings.cooperative')}
        </Text>
        <Text variant="titleMedium">{cooperative?.cooperativeName}</Text>
        {(me?.memberships.length ?? 0) > 1 && (
          <Button
            title={t('settings.switchCooperative')}
            variant="secondary"
            onPress={() => router.push('/select-cooperative')}
            testID="switch-cooperative"
          />
        )}
      </View>
      <Divider />

      {/* US-ACC-04: without biometrics set up on the device, the option is not offered. */}
      {biometrics.available && (
        <View style={[styles.section, styles.row]}>
          <Text variant="titleMedium">{t('settings.biometrics')}</Text>
          <Switch
            value={biometrics.enabled}
            onValueChange={toggleBiometrics}
            accessibilityLabel={t('settings.biometrics')}
            testID="biometrics-switch"
          />
        </View>
      )}
      {biometrics.available && <Divider />}
      {biometricsError ? <ErrorText>{biometricsError}</ErrorText> : null}

      {/* US-ACC-14: only the administrator sees it; the API enforces it. */}
      {canEditBranding(permissions?.permissions) && <AppearanceSection />}

      {/* BR-INV-15: only the administrator sees it; the API enforces it. */}
      {canEditInvoicingSettings(permissions?.permissions) && <InvoicingSettingsSection />}

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
  section: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { textTransform: 'uppercase' },
});
