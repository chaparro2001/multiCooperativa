import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** HU-ACC-05: elegir o cambiar de cooperativa sin volver a identificarse. */
export default function SelectCooperativeScreen() {
  const { me, cooperativeId, select } = useActiveCooperative();
  const { signOut } = useSession();

  if (!me) return <Loading />;

  if (me.memberships.length === 0) {
    return (
      <Screen>
        <Text style={styles.text}>No tienes acceso a ninguna cooperativa.</Text>
        <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  async function choose(id: string) {
    await select(id);
    router.replace('/');
  }

  return (
    <Screen testID="pantalla-selector">
      <Text style={styles.text}>Hola, {me.name}. ¿En qué cooperativa quieres trabajar?</Text>
      <View style={styles.list}>
        {me.memberships.map((membership) => {
          const current = membership.cooperativeId === cooperativeId;
          return (
            <Pressable
              key={membership.cooperativeId}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              onPress={() => choose(membership.cooperativeId)}
              style={({ pressed }) => [
                styles.card,
                current && styles.current,
                pressed && styles.pressed,
              ]}
              testID={`cooperativa-${membership.cooperativeName}`}
            >
              <Text style={styles.name}>{membership.cooperativeName}</Text>
              <Text style={styles.detail}>
                {membership.profileName}
                {membership.isPartner ? ' · Socio' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, color: colors.text },
  list: { gap: 12 },
  card: { padding: 16, borderRadius: 12, backgroundColor: colors.surface, gap: 4 },
  current: { borderWidth: 2, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
});
