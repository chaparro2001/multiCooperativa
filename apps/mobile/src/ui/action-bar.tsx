import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, radius, shadow, space } from './theme';

/**
 * Sticky bottom bar for long forms: `elevation-2` fill, shadow and rounded top corners. Holds the
 * `FormSummary` (when invalid) and the primary block `Button`; a secondary one can sit above.
 * Pass it to `Screen` as `footer` so it stays outside the scroll view.
 */
export function ActionBar({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.elevation.level2, paddingBottom: space[3] + insets.bottom },
      ]}
      testID={testID}
    >
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space[3],
    paddingHorizontal: space[6],
    boxShadow: shadow[2],
  },
  inner: { gap: space[3], width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center' },
});
