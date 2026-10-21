import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

import { badgeText } from './badge-count';

/**
 * Red circle in the top-right corner of a home tile with a count (things that need attention,
 * unread announcements). Nothing is drawn when the count is zero. Decorative: the tile's own
 * accessible label carries the meaning.
 */
export function CountBadge({ count, testID }: { count: number; testID?: string }) {
  const text = badgeText(count);
  if (text === null) return null;
  return (
    <View
      style={styles.badge}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
});
