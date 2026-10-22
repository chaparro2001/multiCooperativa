import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { validateLogin } from '@/auth/form-validation';
import { useForm } from '@/forms/use-form';
import { useSession } from '@/session/session-context';
import { AppLogo } from '@/ui/app-logo';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
import { Screen } from '@/ui/screen';
import { Text, useTheme } from '@/ui/paper';
import { TextField } from '@/ui/text-field';

/** US-ACC-02. */
export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({ values: { email, password }, validate: validateLogin });

  async function submit() {
    setError(null);
    if (!form.validateAll()) return;
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // The session guard takes the user to the cooperative; no manual navigation is needed.
    } catch (failure) {
      setError(messageFor(failure));
      setSubmitting(false);
    }
  }

  return (
    <Screen testID="login-screen" form={form}>
      <View style={styles.title}>
        <AppLogo />
      </View>
      <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
        {t('auth.login.subtitle')}
      </Text>
      <TextField
        label={t('auth.fields.email')}
        name="email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        testID="email-field"
      />
      <TextField
        label={t('auth.fields.password')}
        name="password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        testID="password-field"
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <FormSummary form={form} />
      <Button
        title={t('auth.login.submit')}
        onPress={submit}
        loading={submitting}
        testID="login-button"
      />
      <Text variant="bodyMedium" style={[styles.hint, { color: colors.onSurfaceVariant }]}>
        {t('auth.login.invitedHint')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 48 },
  hint: { textAlign: 'center' },
});
