import { StyleSheet, View } from 'react-native';
import { Badge } from 'react-native-paper';

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
      {/* Paper's Badge is the error-coloured pill (the theme's `error`). */}
      <Badge size={26} style={styles.pill}>
        {text}
      </Badge>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 8, right: 8 },
  pill: { alignSelf: 'auto', fontSize: 13, fontWeight: '700', minWidth: 26 },
});
