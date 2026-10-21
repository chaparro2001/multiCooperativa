import { type Href, Link, router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { type VisibleModule, visibleModules } from '@/navigation/modules';
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
  const title = (entry: VisibleModule) => t(entry.titleKey ?? `enums.module.${entry.module}`);

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
        {/* "Socio · Socio" when the profile is already called like that. */}
        {permissions.isPartner && cooperative?.profileName !== t('common.partner')
          ? ` · ${t('common.partner')}`
          : ''}
      </Text>
      <View style={styles.grid}>
        {modules.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={title(entry)}
            onPress={() => router.push(entry.route as Href)}
            style={({ pressed }) => [styles.cell, { width: cellWidth }, pressed && styles.pressed]}
            testID={`module-${entry.id}`}
          >
            <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
              {entry.emoji}
            </Text>
            <Text style={styles.cellTitle} numberOfLines={2}>
              {title(entry)}
            </Text>
            {entry.comingSoon && (
              <Text style={styles.badge} testID={`coming-soon-${entry.id}`}>
                {t('modulePlaceholder.badge')}
              </Text>
            )}
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
  badge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
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
