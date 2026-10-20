import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

/** US-ACC-01: opened from multicooperativa://invitation?token=… */
export default function InvitationScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { status, acceptInvitation } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  if (!token) {
    return (
      <Screen>
        <ErrorText>{t('auth.invitation.invalidLink')}</ErrorText>
      </Screen>
    );
  }

  async function submit() {
    setError(null);
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
      setError(
        failure instanceof ApiError && failure.code === 'password_required'
          ? t('auth.invitation.passwordRequired')
          : messageFor(failure),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (activated) {
    // Existing account: the link does not open a session by itself.
    return (
      <Screen testID="invitation-activated">
        <Text style={styles.title}>{t('auth.invitation.activatedTitle')}</Text>
        <Text style={styles.text}>
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
    <Screen testID="invitation-screen">
      <Text style={styles.title}>{t('auth.invitation.title')}</Text>
      <Text style={styles.text}>{t('auth.invitation.instructions')}</Text>
      <TextField
        label={t('auth.fields.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        testID="new-password-field"
      />
      {error && <ErrorText>{error}</ErrorText>}
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
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.muted },
});
