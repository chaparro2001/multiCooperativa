import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

/** HU-ACC-01: opened from multicooperativa://invitacion?token=… */
export default function InvitationScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { status, acceptInvitation } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  if (!token) {
    return (
      <Screen>
        <ErrorText>
          El enlace de invitación no es válido. Pide uno nuevo a tu cooperativa.
        </ErrorText>
      </Screen>
    );
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await acceptInvitation(token!, password || undefined);
      if (result.tokens) {
        // Usuario nuevo: ya tiene sesión y la guarda lo lleva dentro.
        router.replace('/');
      } else {
        setActivated(true);
      }
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'password_required'
          ? 'Es tu primera cooperativa en multiCooperativa: elige una contraseña.'
          : messageFor(failure),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (activated) {
    // Cuenta existente: el enlace no abre sesión por sí solo.
    return (
      <Screen testID="invitacion-activada">
        <Text style={styles.title}>Acceso activado</Text>
        <Text style={styles.text}>
          {status === 'signedIn'
            ? 'La nueva cooperativa ya aparece en tu selector de cooperativas.'
            : 'Entra con tu email y tu contraseña de siempre.'}
        </Text>
        <Button
          title={status === 'signedIn' ? 'Ir a mis cooperativas' : 'Iniciar sesión'}
          onPress={() =>
            router.replace(status === 'signedIn' ? '/seleccionar-cooperativa' : '/login')
          }
        />
      </Screen>
    );
  }

  return (
    <Screen testID="pantalla-invitacion">
      <Text style={styles.title}>Activa tu acceso</Text>
      <Text style={styles.text}>
        Elige una contraseña de al menos 10 caracteres. Si ya usas multiCooperativa con otra
        cooperativa, déjala en blanco: se añadirá a tu cuenta.
      </Text>
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        testID="campo-nueva-contrasena"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Activar" onPress={submit} loading={submitting} testID="boton-activar" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.muted },
});
