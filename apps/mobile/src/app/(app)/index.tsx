import { Settings } from 'lucide-react-native';
import { type Href, router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useBrand } from '@/branding/brand';
import { BrandLogo } from '@/branding/brand-logo';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { tileBadge } from '@/features/home/tile-badges';
import { useTileBadgeCounts } from '@/features/home/use-tile-badges';
import { type VisibleModule, visibleModules } from '@/navigation/modules';
import { CountBadge } from '@/ui/count-badge';
import { Loading, Screen, SCREEN_MAX_WIDTH, SCREEN_PADDING } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

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
  const brand = useBrand();
  // Count badges (unread announcements, invoices and delivery notes needing attention).
  const badgeCounts = useTileBadgeCounts();

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
            <HeaderActions>
              <HeaderAction
                href="/settings"
                icon={Settings}
                label={t('settings.title')}
                testID="settings-link"
              />
            </HeaderActions>
          ),
        }}
      />
      <View style={styles.identity}>
        {/* US-ACC-14: the cooperative's logo, when its administrator uploaded one. */}
        {brand.logoUrl && <BrandLogo size={56} testID="home-logo" />}
        <View style={styles.identityText}>
          {brand.logoUrl && (
            <Text style={styles.cooperativeName} numberOfLines={2} testID="home-cooperative-name">
              {cooperative?.cooperativeName}
            </Text>
          )}
          <Text style={styles.profile}>
            {cooperative?.profileName}
            {/* "Socio · Socio" when the profile is already called like that. */}
            {permissions.isPartner && cooperative?.profileName !== t('common.partner')
              ? ` · ${t('common.partner')}`
              : ''}
          </Text>
        </View>
      </View>
      <View style={styles.grid}>
        {modules.map((entry) => {
          const badge = tileBadge(entry.id, badgeCounts);
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={
                badge
                  ? `${title(entry)}, ${t(badge.labelKey, { count: badge.count })}`
                  : title(entry)
              }
              onPress={() => router.push(entry.route as Href)}
              style={({ pressed }) => [
                styles.cell,
                { width: cellWidth },
                pressed && styles.pressed,
              ]}
              testID={`module-${entry.id}`}
            >
              <View accessibilityElementsHidden importantForAccessibility="no">
                <entry.icon size={40} strokeWidth={1.75} color={brand.primaryColor} aria-hidden />
              </View>
              <Text style={styles.cellTitle} numberOfLines={2}>
                {title(entry)}
              </Text>
              {/* The accent only shows once the cooperative picked its own colour. */}
              {brand.configuredColor && (
                <View style={[styles.accent, { backgroundColor: brand.primaryColor }]} />
              )}
              {entry.comingSoon && (
                <Text style={styles.badge} testID={`coming-soon-${entry.id}`}>
                  {t('modulePlaceholder.badge')}
                </Text>
              )}
              <CountBadge count={badge?.count ?? 0} testID={`count-badge-${entry.id}`} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, gap: 2 },
  cooperativeName: { fontSize: 20, fontWeight: '700', color: colors.text },
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
  accent: { width: 28, height: 4, borderRadius: 2 },
  cellTitle: {
    fontSize: 16,
    lineHeight: 20,
    // Always two lines tall, so icons line up across a row even when a title wraps.
    minHeight: 40,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
