import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text, useTheme } from '@/ui/paper';
import { Screen } from '@/ui/screen';
import { Skeleton } from '@/ui/states';
import { colors as fixedColors, radius, space } from '@/ui/theme';

const DOT = 12;

/** US-ACC-05: choose or switch cooperative without logging in again. */
export default function SelectCooperativeScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { me, cooperativeId, select } = useActiveCooperative();
  const { signOut } = useSession();

  if (!me) {
    return (
      <Screen>
        <Skeleton variant="list" rows={3} />
      </Screen>
    );
  }

  if (me.memberships.length === 0) {
    return (
      <Screen>
        <Text variant="bodyLarge">{t('cooperatives.select.none')}</Text>
        <Button title={t('settings.signOut')} variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  async function choose(id: string) {
    await select(id);
    router.replace('/');
  }

  return (
    <Screen testID="selector-screen">
      <Text variant="headlineMedium">{t('cooperatives.select.prompt', { name: me.name })}</Text>
      <View style={styles.list}>
        {me.memberships.map((membership) => (
          <Card
            key={membership.cooperativeId}
            selected={membership.cooperativeId === cooperativeId}
            onPress={() => choose(membership.cooperativeId)}
            testID={`cooperative-${membership.cooperativeName}`}
          >
            <View style={styles.card}>
              <View style={styles.nameRow}>
                {/* Decorative: the cooperative's own colour, the default green when it has none. */}
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: membership.primaryColor ?? fixedColors.primary },
                  ]}
                />
                <Text variant="titleMedium" style={styles.name}>
                  {membership.cooperativeName}
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                {membership.profileName}
                {membership.isPartner ? ` · ${t('common.partner')}` : ''}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  card: { gap: space[1] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  dot: { width: DOT, height: DOT, borderRadius: radius.full },
  name: { flexShrink: 1 },
});
