import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useBiometrics } from '@/auth/biometrics';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { canEditBranding } from '@/features/branding/brand-color';
import { canEditInvoicingSettings } from '@/features/invoicing/attention';
import { canChooseAssistantModel } from '@/features/assistant/model-settings';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { ListRow } from '@/ui/list-row';
import { Icon, Text, useTheme } from '@/ui/paper';
import { ErrorText, Screen } from '@/ui/screen';
import { SectionTitle } from '@/ui/section-title';
import { SwitchRow } from '@/ui/switch-row';
import { space } from '@/ui/theme';

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

  const openAppearance = useCallback(() => router.push('/settings/appearance'), []);
  const openInvoicing = useCallback(() => router.push('/settings/invoicing'), []);
  const openAssistant = useCallback(() => router.push('/settings/assistant'), []);

  // US-ACC-14, BR-INV-15, US-AI-07: only the administrator sees each one; the API enforces it.
  const canBrand = canEditBranding(permissions?.permissions);
  const canInvoicing = canEditInvoicingSettings(permissions?.permissions);
  const canAssistant = canChooseAssistantModel(permissions?.permissions);
  const chevron = <Icon source="chevron-right" size={24} color={colors.onSurfaceVariant} />;

  return (
    <Screen testID="settings-screen">
      <View style={styles.group}>
        <Text variant="titleMedium">{me?.name}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {me?.email}
        </Text>
      </View>

      <View style={styles.group}>
        <SectionTitle small>{t('settings.cooperative')}</SectionTitle>
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

      {/* US-ACC-04: without biometrics set up on the device, the option is not offered. */}
      {biometrics.available && (
        <View style={styles.group}>
          <SwitchRow
            label={t('settings.biometrics')}
            value={biometrics.enabled}
            onValueChange={toggleBiometrics}
            testID="biometrics-switch"
          />
        </View>
      )}
      {biometricsError ? <ErrorText>{biometricsError}</ErrorText> : null}

      {canBrand || canInvoicing || canAssistant ? (
        <View style={styles.group}>
          <SectionTitle small>{t('settings.admin.title')}</SectionTitle>
          {canBrand ? (
            <ListRow
              title={t('settings.appearance.title')}
              meta={t('settings.admin.appearance')}
              status={chevron}
              onPress={openAppearance}
              testID="settings-appearance-link"
            />
          ) : null}
          {canInvoicing ? (
            <ListRow
              title={t('settings.invoicing.title')}
              meta={t('settings.admin.invoicing')}
              status={chevron}
              onPress={openInvoicing}
              testID="settings-invoicing-link"
            />
          ) : null}
          {canAssistant ? (
            <ListRow
              title={t('settings.assistantModel.title')}
              meta={t('settings.admin.assistant')}
              status={chevron}
              onPress={openAssistant}
              testID="settings-assistant-link"
            />
          ) : null}
        </View>
      ) : null}

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
  group: { gap: space[2] },
});
