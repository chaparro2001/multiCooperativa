import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

/** HU-ACC-02. */
export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // La guarda de sesión lleva a la cooperativa; no hay que navegar a mano.
    } catch (failure) {
      setError(messageFor(failure));
      setSubmitting(false);
    }
  }

  return (
    <Screen testID="pantalla-login">
      <Text style={styles.title}>multiCooperativa</Text>
      <Text style={styles.subtitle}>Entra con el email y la contraseña de tu cooperativa.</Text>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        testID="campo-email"
      />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        testID="campo-contrasena"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title="Entrar"
        onPress={submit}
        loading={submitting}
        disabled={!email || !password}
        testID="boton-entrar"
      />
      <Text style={styles.hint}>
        ¿Te han invitado? Abre el enlace del correo de invitación desde este dispositivo.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: 48 },
  subtitle: { fontSize: 16, color: colors.muted },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
