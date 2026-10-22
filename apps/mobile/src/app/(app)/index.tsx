import { type Href, router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { useAssemblyList } from '@/features/assemblies/queries';
import { useUnreadAnnouncements } from '@/features/announcements/queries';
import { useInvoicingAttention } from '@/features/invoicing/queries';
import { type AttentionItemData, attentionItems } from '@/features/home/attention';
import { tileBadge } from '@/features/home/tile-badges';
import { useTileBadgeCounts } from '@/features/home/use-tile-badges';
import { formatDateTime } from '@/i18n/format';
import { canAccess, type VisibleModule, visibleModules } from '@/navigation/modules';
import { AttentionItem } from '@/ui/attention-item';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { HomeTile } from '@/ui/home-tile';
import type { IconName } from '@/ui/paper-settings';
import { Text, useTheme } from '@/ui/paper';
import { Screen, SCREEN_MAX_WIDTH, SCREEN_PADDING } from '@/ui/screen';
import { SectionTitle } from '@/ui/section-title';
import { Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';

const GAP = space[3];
/** Tile height on wide windows, where squares would be too tall (ScreenHomeWeb). */
const WIDE_TILE_HEIGHT = 160;

const ATTENTION_ICONS = {
  votes: 'vote-outline',
  invoices: 'receipt-text-outline',
  assembly: 'hand-back-left-outline',
  announcements: 'bullhorn-outline',
} as const satisfies Record<AttentionItemData['kind'], IconName>;

/** Two columns on phones; three or four on wider windows (tablets, web build). */
function columnsFor(width: number): number {
  if (width >= 840) return 4;
  if (width >= 600) return 3;
  return 2;
}

/** Cooperative home: attention strip plus one tile per module of the profile (US-ACC-06). */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { cooperative, permissions } = useActiveCooperative();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  // Count badges (unread announcements, invoices and delivery notes needing attention).
  const badgeCounts = useTileBadgeCounts();
  const list = permissions?.permissions;
  // Same queries as the badges and the module screens: shared cache, no extra API calls.
  const assemblies = useAssemblyList(canAccess(list, 'assemblies'));
  const unread = useUnreadAnnouncements(canAccess(list, 'announcements'));
  const attention = useInvoicingAttention(canAccess(list, 'invoicing'));
  const pending = attentionItems({
    assemblies: assemblies.data?.items,
    unreadAnnouncements: unread.data?.unread,
    invoicesNeedingAttention: attention.data?.invoices,
    now: new Date(),
  });

  if (!permissions) {
    return (
      <Screen>
        <Skeleton variant="list" />
      </Screen>
    );
  }
  const modules = visibleModules(permissions.permissions);
  const columns = columnsFor(width);
  const contentWidth = Math.min(width, SCREEN_MAX_WIDTH) - 2 * SCREEN_PADDING;
  const cellWidth = (contentWidth - GAP * (columns - 1)) / columns;
  // Wide windows (ScreenHomeWeb): fixed-height tiles instead of squares, strip in three columns.
  const wide = columns === 4;
  const tileStyle = wide
    ? { width: cellWidth, height: WIDE_TILE_HEIGHT, aspectRatio: 'auto' as const }
    : { width: cellWidth };
  const attentionWidth = wide ? { width: (contentWidth - GAP * 2) / 3 } : undefined;
  const title = (entry: VisibleModule) => t(entry.titleKey ?? `enums.module.${entry.module}`);
  const attentionTitle = (item: AttentionItemData): string => {
    const count = item.count ?? 0;
    switch (item.kind) {
      case 'votes':
        return t('home.attention.votes', { count });
      case 'invoices':
        return t('home.attention.invoices', { count });
      case 'announcements':
        return t('home.attention.announcements', { count });
      default:
        return t('home.attention.assembly');
    }
  };
  const attentionMeta = (item: AttentionItemData): string => {
    switch (item.kind) {
      case 'votes':
        return t('home.attention.votesMeta');
      case 'invoices':
        return t('home.attention.invoicesMeta');
      case 'announcements':
        return t('home.attention.announcementsMeta');
      default:
        return item.at ? formatDateTime(item.at) : '';
    }
  };
  return (
    <Screen testID="home-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderAction
                href="/settings"
                icon="cog-outline"
                label={t('settings.title')}
                testID="settings-link"
              />
            </HeaderActions>
          ),
        }}
      />
      <Text variant="bodyMedium" style={{ color: colors.secondary }}>
        {cooperative?.profileName}
        {/* "Socio · Socio" when the profile is already called like that. */}
        {permissions.isPartner && cooperative?.profileName !== t('common.partner')
          ? ` · ${t('common.partner')}`
          : ''}
      </Text>
      {pending.length > 0 ? (
        <View style={styles.attention} testID="home-attention">
          <SectionTitle>{t('home.attention.title')}</SectionTitle>
          <View style={wide ? styles.attentionRow : styles.attention}>
            {pending.map((item) => (
              <AttentionItem
                key={item.kind}
                icon={ATTENTION_ICONS[item.kind]}
                title={attentionTitle(item)}
                meta={attentionMeta(item)}
                onPress={() => router.push(item.route as Href)}
                style={attentionWidth}
                testID={`attention-${item.kind}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.grid}>
        {modules.map((entry) => {
          const badge = tileBadge(entry.id, badgeCounts);
          return (
            <HomeTile
              key={entry.id}
              icon={entry.icon}
              title={title(entry)}
              count={badge?.count ?? 0}
              countLabel={badge ? t(badge.labelKey, { count: badge.count }) : undefined}
              onPress={() => router.push(entry.route as Href)}
              style={tileStyle}
              testID={`module-${entry.id}`}
              countTestID={`count-badge-${entry.id}`}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  attention: { gap: space[2] },
  attentionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
