import { type Href, Link, router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { visibleModules } from '@/navigation/modules';
import { Loading, Screen, SCREEN_MAX_WIDTH, SCREEN_PADDING } from '@/ui/screen';
import { colors } from '@/ui/theme';

const GAP = 12;

/** Two columns on phones; three or four on wider windows (tablets, web build). */
function columnsFor(width: number): number {
  if (width >= 840) return 4;
  if (width >= 600) return 3;
  return 2;
}

/** Cooperative home: one cell per module of the profile (US-ACC-06). */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { cooperative, permissions } = useActiveCooperative();
  const { width } = useWindowDimensions();

  if (!permissions) return <Loading />;
  const modules = visibleModules(permissions.permissions);
  const columns = columnsFor(width);
  const contentWidth = Math.min(width, SCREEN_MAX_WIDTH) - 2 * SCREEN_PADDING;
  const cellWidth = (contentWidth - GAP * (columns - 1)) / columns;

  return (
    <Screen testID="home-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" accessibilityLabel={t('settings.title')} testID="settings-link">
              <Text style={styles.headerLink}>{t('settings.title')}</Text>
            </Link>
          ),
        }}
      />
      <Text style={styles.profile}>
        {cooperative?.profileName}
        {permissions.isPartner ? ` · ${t('common.partner')}` : ''}
      </Text>
      <View style={styles.grid}>
        {modules.map((entry) => (
          <Pressable
            key={entry.module}
            accessibilityRole="button"
            accessibilityLabel={t(`enums.module.${entry.module}`)}
            onPress={() => router.push(entry.route as Href)}
            style={({ pressed }) => [styles.cell, { width: cellWidth }, pressed && styles.pressed]}
            testID={`module-${entry.module}`}
          >
            <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
              {entry.emoji}
            </Text>
            <Text style={styles.cellTitle} numberOfLines={2}>
              {t(`enums.module.${entry.module}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The web header puts headerRight flush against the window edge.
  headerLink: { color: colors.primary, fontSize: 16, marginRight: Platform.OS === 'web' ? 16 : 0 },
  profile: { fontSize: 15, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: {
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
