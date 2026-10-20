import type { Module } from '@multicooperativa/contracts';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** Stand-in until each module is built in its milestone. */
export function ModulePlaceholder({ module }: { module: Module }) {
  const { t } = useTranslation();
  const { permissions } = useActiveCooperative();
  const permission = permissions?.permissions.find((p) => p.module === module);

  return (
    <Screen testID={`screen-${module}`}>
      <Text style={styles.title}>{t(`enums.module.${module}`)}</Text>
      <Text style={styles.text}>{t('modulePlaceholder.comingSoon')}</Text>
      {permission && (
        <Text style={styles.text}>
          {t('modulePlaceholder.access', {
            level: t(`enums.accessLevel.${permission.level}`),
            scope: permission.scope === 'own' ? t('modulePlaceholder.ownDataOnly') : '',
          })}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.muted },
});
