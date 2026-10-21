import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { useSession } from '@/session/session-context';
import { Button } from '@/ui/button';
import { Card, Text, useTheme } from '@/ui/paper';
import { Loading, Screen } from '@/ui/screen';
import { useBrandColor } from '@/branding/brand';

/** US-ACC-05: choose or switch cooperative without logging in again. */
export default function SelectCooperativeScreen() {
  const brand = useBrandColor();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { me, cooperativeId, select } = useActiveCooperative();
  const { signOut } = useSession();

  if (!me) return <Loading />;

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
      <Text variant="bodyLarge">{t('cooperatives.select.prompt', { name: me.name })}</Text>
      <View style={styles.list}>
        {me.memberships.map((membership) => {
          const current = membership.cooperativeId === cooperativeId;
          return (
            <Card
              key={membership.cooperativeId}
              mode="contained"
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              onPress={() => choose(membership.cooperativeId)}
              style={current ? [styles.current, { borderColor: brand }] : undefined}
              testID={`cooperative-${membership.cooperativeName}`}
            >
              <Card.Content style={styles.card}>
                <Text variant="titleMedium">{membership.cooperativeName}</Text>
                <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                  {membership.profileName}
                  {membership.isPartner ? ` · ${t('common.partner')}` : ''}
                </Text>
              </Card.Content>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { gap: 4 },
  current: { borderWidth: 2 },
});
