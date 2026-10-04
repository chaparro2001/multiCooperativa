import { type Href, Link, router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { visibleModules } from '@/navigation/modules';
import { Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** Inicio de la cooperativa: solo los módulos del perfil (HU-ACC-06). */
export default function HomeScreen() {
  const { cooperative, permissions } = useActiveCooperative();

  if (!permissions) return <Loading />;
  const modules = visibleModules(permissions.permissions);

  return (
    <Screen testID="pantalla-inicio">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/ajustes" accessibilityLabel="Ajustes" testID="enlace-ajustes">
              <Text style={styles.headerLink}>Ajustes</Text>
            </Link>
          ),
        }}
      />
      <Text style={styles.profile}>
        {cooperative?.profileName}
        {permissions.isPartner ? ' · Socio' : ''}
      </Text>
      <View style={styles.list}>
        {modules.map((entry) => (
          <Pressable
            key={entry.module}
            accessibilityRole="button"
            onPress={() => router.push(entry.route as Href)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            testID={`modulo-${entry.module}`}
          >
            <Text style={styles.cardTitle}>{entry.title}</Text>
            <Text style={styles.cardDetail}>{entry.canManage ? 'Gestión' : 'Consulta'}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerLink: { color: colors.primary, fontSize: 16 },
  profile: { fontSize: 15, color: colors.muted },
  list: { gap: 12 },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  cardDetail: { fontSize: 13, color: colors.muted },
});
