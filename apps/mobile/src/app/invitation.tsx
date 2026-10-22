import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  INVITATION_FIELDS,
  INVITATION_SERVER_MAPPING,
  validateInvitation,
} from '@/auth/form-validation';
import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import { useSession } from '@/session/session-context';
import { AppLogo } from '@/ui/app-logo';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
import { Screen } from '@/ui/screen';
import { Icon, Text, useTheme } from '@/ui/paper';
import { ErrorState } from '@/ui/states';
import { TextField } from '@/ui/text-field';

/** US-ACC-01: opened from multicooperativa://invitation?token=… */
export default function InvitationScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { status, acceptInvitation } = useSession();
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);
  const form = useForm({ values: { password, confirm }, validate: validateInvitation });

  if (!token) {
    return (
      <Screen>
        <ErrorState message={t('auth.invitation.invalidLink')} onRetry={false} />
      </Screen>
    );
  }

  async function submit() {
    setError(null);
    if (!form.validateAll()) return;
    setSubmitting(true);
    try {
      const result = await acceptInvitation(token!, password || undefined);
      if (result.tokens) {
        // New user: they already have a session and the guard takes them in.
        router.replace('/');
      } else {
        setActivated(true);
      }
    } catch (failure) {
      // A new user without a password, or a weak one, is marked on the password field.
      const routed = routeServerError(failure, INVITATION_SERVER_MAPPING, (field) =>
        (INVITATION_FIELDS as readonly string[]).includes(field),
      );
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    } finally {
      setSubmitting(false);
    }
  }

  if (activated) {
    // Existing account: the link does not open a session by itself.
    return (
      <Screen testID="invitation-activated">
        <View style={styles.success}>
          <Icon source="check-circle-outline" size={48} color={colors.primary} />
        </View>
        <Text variant="headlineLarge">{t('auth.invitation.activatedTitle')}</Text>
        <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
          {status === 'signedIn'
            ? t('auth.invitation.activatedSignedIn')
            : t('auth.invitation.activatedSignedOut')}
        </Text>
        <Button
          title={
            status === 'signedIn'
              ? t('auth.invitation.goToCooperatives')
              : t('auth.invitation.goToLogin')
          }
          onPress={() => router.replace(status === 'signedIn' ? '/select-cooperative' : '/login')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="invitation-screen" form={form}>
      <View style={styles.logo}>
        <AppLogo />
      </View>
      <Text variant="headlineLarge">{t('auth.invitation.title')}</Text>
      <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
        {t('auth.invitation.instructions')}
      </Text>
      <TextField
        label={t('auth.fields.password')}
        name="password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        testID="new-password-field"
      />
      <TextField
        label={t('auth.fields.confirmPassword')}
        name="confirm"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
        testID="confirm-password-field"
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <FormSummary form={form} />
      <Button
        title={t('auth.invitation.submit')}
        onPress={submit}
        loading={submitting}
        testID="activate-button"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { marginTop: 16 },
  success: { alignItems: 'center' },
});
