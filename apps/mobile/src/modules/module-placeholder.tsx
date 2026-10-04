import type { Module } from '@multicooperativa/contracts';
import { StyleSheet, Text } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { MODULE_ENTRIES } from '@/navigation/modules';
import { Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** Stand-in until each module is built in its milestone. */
export function ModulePlaceholder({ module }: { module: Module }) {
  const { permissions } = useActiveCooperative();
  const permission = permissions?.permissions.find((p) => p.module === module);
  const entry = MODULE_ENTRIES.find((candidate) => candidate.module === module)!;

  return (
    <Screen testID={`pantalla-${module}`}>
      <Text style={styles.title}>{entry.title}</Text>
      <Text style={styles.text}>Esta sección llegará en un próximo hito.</Text>
      <Text style={styles.text}>
        Tu acceso: {permission?.level === 'gestion' ? 'gestión' : 'consulta'}
        {permission?.scope === 'propias' ? ' (solo tus datos)' : ''}.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.muted },
});
