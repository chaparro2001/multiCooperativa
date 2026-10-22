import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { IconName } from './paper-settings';
import { colors, radius, space } from './theme';

const DEFAULT_ICON: Record<BannerTone, IconName> = {
  warning: 'alert-outline',
  danger: 'alert-circle-outline',
  info: 'information-outline',
};

export type BannerTone = 'warning' | 'danger' | 'info';

/**
 * Full-width strip for a state of the whole screen or list, with an optional text action
 * (a `Button variant="text"`). `danger` is announced as an alert. Never stack more than two.
 * AI and privacy messages use `AiNotice`, not a banner.
 */
export function Banner({
  tone = 'warning',
  icon,
  action,
  children,
  testID,
}: {
  tone?: BannerTone;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const { colors: theme } = useTheme();
  const { backgroundColor, iconColor, textColor } =
    tone === 'warning'
      ? {
          backgroundColor: colors.warningContainer,
          iconColor: colors.warning,
          textColor: theme.onSurface,
        }
      : tone === 'danger'
        ? {
            backgroundColor: colors.dangerContainer,
            iconColor: colors.danger,
            textColor: theme.onSurface,
          }
        : {
            backgroundColor: theme.primaryContainer,
            iconColor: theme.onPrimaryContainer,
            textColor: theme.onPrimaryContainer,
          };
  return (
    <View
      style={[styles.banner, { backgroundColor }]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      testID={testID}
    >
      <View style={styles.row}>
        <Icon source={icon ?? DEFAULT_ICON[tone]} size={22} color={iconColor} />
        <Text variant="bodyMedium" style={[styles.text, { color: textColor }]}>
          {children}
        </Text>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[1],
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  text: { flex: 1 },
  action: { alignItems: 'flex-end' },
});
