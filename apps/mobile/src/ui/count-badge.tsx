import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { badgeText } from './badge-count';
import { colors, radius, size, space } from './theme';

/**
 * Red count bubble in the top-right corner of a home tile (things that need attention, unread
 * announcements): `on-danger` number, 2 px surface ring, "99+" above 99. Nothing is drawn when
 * the count is zero. Decorative: the tile's own accessible label carries the meaning.
 */
export function CountBadge({ count, testID }: { count: number; testID?: string }) {
  const { colors: theme } = useTheme();
  const text = badgeText(count);
  if (text === null) return null;
  return (
    <View
      style={styles.corner}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <View style={[styles.pill, { borderColor: theme.surface }]}>
        <Text variant="labelSmall" style={styles.text}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', top: space[2], right: space[2] },
  pill: {
    minWidth: size.countBadge,
    height: size.countBadge,
    paddingHorizontal: space[1],
    borderRadius: radius.full,
    borderWidth: 2,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'content-box',
  },
  text: { color: '#ffffff', fontWeight: '700' },
});
