import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { Card } from './card';
import type { IconName } from './paper-settings';
import { space } from './theme';

/**
 * Compact row of the home "Pendiente para ti" strip: module icon, `titleMedium` title, muted
 * meta, optional status badge and a chevron. At most three, most urgent first, hidden when
 * nothing is pending (the screen decides).
 */
export function AttentionItem({
  icon,
  title,
  meta,
  badge,
  onPress,
  style,
  testID,
}: {
  icon: IconName;
  title: string;
  meta?: string;
  badge?: ReactNode;
  onPress(): void;
  /** The parent sets the column width on wide windows (three per row). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} testID={testID} style={[styles.card, style]}>
      <View style={styles.row}>
        <Icon source={icon} size={24} color={colors.primary} />
        <View style={styles.text}>
          <Text variant="titleMedium">{title}</Text>
          {meta ? (
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
              {meta}
            </Text>
          ) : null}
        </View>
        {badge}
        <Icon source="chevron-right" size={24} color={colors.onSurfaceVariant} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  text: { flex: 1 },
});
