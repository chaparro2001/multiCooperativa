import { type Href, Link, router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { visibleModules } from '@/navigation/modules';
import { Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** Inicio de la cooperativa: una celda por módulo del perfil, dos por fila (HU-ACC-06). */
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
      <View style={styles.grid}>
        {modules.map((entry) => (
          <Pressable
            key={entry.module}
            accessibilityRole="button"
            accessibilityLabel={entry.title}
            onPress={() => router.push(entry.route as Href)}
            style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
            testID={`modulo-${entry.module}`}
          >
            <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
              {entry.emoji}
            </Text>
            <Text style={styles.cellTitle} numberOfLines={2}>
              {entry.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerLink: { color: colors.primary, fontSize: 16 },
  profile: { fontSize: 15, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: {
    // Two per row; the gap between them comes from space-between.
    width: '48.5%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
  },
  pressed: { opacity: 0.7 },
  emoji: { fontSize: 44 },
  cellTitle: {
    fontSize: 16,
    lineHeight: 20,
    // Always two lines tall, so emojis line up across a row even when a title wraps.
    minHeight: 40,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
