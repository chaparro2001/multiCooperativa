import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { messageFor } from '@/api/api-error';
import { validateLogin } from '@/auth/form-validation';
import { useForm } from '@/forms/use-form';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

/** US-ACC-02. */
export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
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
      <Text style={styles.title}>multiCooperativa</Text>
      <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>
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
      {error && <ErrorText>{error}</ErrorText>}
      <FormSummary form={form} />
      <Button
        title={t('auth.login.submit')}
        onPress={submit}
        loading={submitting}
        testID="login-button"
      />
      <Text style={styles.hint}>{t('auth.login.invitedHint')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: 48 },
  subtitle: { fontSize: 16, color: colors.muted },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
