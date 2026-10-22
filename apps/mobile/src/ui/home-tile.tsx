import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { CountBadge } from './count-badge';
import type { IconName } from './paper-settings';
import { PressableBox } from './pressable-box';
import { radius, size, space } from './theme';

/**
 * Square module tile of the home grid: brand-tinted fill, 40 px icon top-left, title bottom-left
 * (up to two lines) and an optional red `CountBadge` top-right. `countLabel` is the count in
 * words ("3 comunicados sin leer"): the accessible label reads "title, countLabel". The parent
 * sets the column width through `style`. Keep the screen's `testID` (`module-<id>`) here.
 */
export function HomeTile({
  icon,
  title,
  count = 0,
  countLabel,
  onPress,
  style,
  testID,
  countTestID,
}: {
  icon: IconName;
  title: string;
  count?: number;
  countLabel?: string;
  onPress(): void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  countTestID?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableBox
      style={[styles.tile, { backgroundColor: colors.primaryContainer }, style]}
      pressedColor={colors.elevation.level5}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 && countLabel ? `${title}, ${countLabel}` : title}
      testID={testID}
    >
      <View>
        <Icon source={icon} size={size.iconTile} color={colors.primary} />
      </View>
      <Text variant="titleMedium" numberOfLines={2} style={{ color: colors.onPrimaryContainer }}>
        {title}
      </Text>
      <CountBadge count={count} testID={countTestID} />
    </PressableBox>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 1,
    borderRadius: radius.md,
    padding: space[4],
    justifyContent: 'space-between',
  },
});
