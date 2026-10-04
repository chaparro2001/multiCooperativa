import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useBiometrics } from '@/auth/biometrics';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

export default function SettingsScreen() {
  const { me, cooperative } = useActiveCooperative();
  const { signOut } = useSession();
  const biometrics = useBiometrics();
  const [biometricsError, setBiometricsError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function toggleBiometrics(value: boolean) {
    setBiometricsError(null);
    const changed = await biometrics.setEnabled(value);
    if (!changed) setBiometricsError('No se ha podido verificar tu identidad.');
  }

  return (
    <Screen testID="pantalla-ajustes">
      <View style={styles.section}>
        <Text style={styles.name}>{me?.name}</Text>
        <Text style={styles.detail}>{me?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Cooperativa</Text>
        <Text style={styles.name}>{cooperative?.cooperativeName}</Text>
        {(me?.memberships.length ?? 0) > 1 && (
          <Button
            title="Cambiar de cooperativa"
            variant="secondary"
            onPress={() => router.push('/seleccionar-cooperativa')}
            testID="cambiar-cooperativa"
          />
        )}
      </View>

      {/* HU-ACC-04: sin biometría configurada en el dispositivo, la opción no se ofrece. */}
      {biometrics.available && (
        <View style={[styles.section, styles.row]}>
          <Text style={styles.name}>Desbloqueo con biometría</Text>
          <Switch
            value={biometrics.enabled}
            onValueChange={toggleBiometrics}
            accessibilityLabel="Desbloqueo con biometría"
            testID="interruptor-biometria"
          />
        </View>
      )}
      {biometricsError && <ErrorText>{biometricsError}</ErrorText>}

      <Button
        title="Cerrar sesión"
        variant="danger"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
        testID="cerrar-sesion"
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
