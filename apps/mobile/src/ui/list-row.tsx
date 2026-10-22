import { Children, memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { Card } from './card';
import { Money } from './money';
import type { IconName } from './paper-settings';
import { colors, space } from './theme';

export interface ListRowAlert {
  tone?: 'danger' | 'warning';
  text: string;
  icon?: IconName;
}

/**
 * The row card every list uses. Top to bottom: head (unread dot, `titleMedium` title, trailing
 * amount and the ONE status badge), more badges (at most one more filled; otherwise quiet ones),
 * meta (`bodyMedium` muted, already joined with " · ") and an alert line with icon.
 * Memoized: pass stable `onPress` and element props from the list's `renderItem`. Keep the
 * screen's `testID` here: it lands on the pressable card.
 */
export const ListRow = memo(function ListRow({
  title,
  meta,
  unread = false,
  amount,
  status,
  badges,
  alert,
  onPress,
  testID,
  accessibilityLabel,
}: {
  title: string;
  meta?: string;
  unread?: boolean;
  /** Exact decimal string; negative shows in danger with a true minus. */
  amount?: string;
  status?: ReactNode;
  badges?: ReactNode;
  alert?: ListRowAlert;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors: theme } = useTheme();
  const badgeList = Children.toArray(badges);
  const alertColor = alert?.tone === 'warning' ? colors.warning : colors.danger;
  return (
    <Card
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={styles.card}
    >
      <View style={styles.head}>
        {unread ? <View style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
        <Text variant="titleMedium" style={[styles.title, unread ? styles.unread : null]}>
          {title}
        </Text>
        {amount !== undefined || status ? (
          <View style={styles.trailing}>
            {amount !== undefined ? <Money amount={amount} variant="titleMedium" /> : null}
            {status}
          </View>
        ) : null}
      </View>
      {badgeList.length > 0 ? <View style={styles.badges}>{badgeList}</View> : null}
      {meta ? (
        <Text variant="bodyMedium" style={{ color: theme.onSurfaceVariant }}>
          {meta}
        </Text>
      ) : null}
      {alert ? (
        <View style={styles.alert}>
          <Icon
            source={
              alert.icon ?? (alert.tone === 'warning' ? 'clock-outline' : 'alert-circle-outline')
            }
            size={18}
            color={alertColor}
          />
          <Text variant="bodyMedium" style={[styles.alertText, { color: alertColor }]}>
            {alert.text}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: space[2] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 7 },
  title: { flex: 1 },
  unread: { fontWeight: '700' },
  trailing: { alignItems: 'flex-end', gap: space[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  alert: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  alertText: { flex: 1 },
});
