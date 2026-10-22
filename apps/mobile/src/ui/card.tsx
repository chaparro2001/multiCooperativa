import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

import { PressableBox } from './pressable-box';
import { radius, space } from './theme';

/**
 * The generic container: white surface, 1 px hairline, 12 radius, 16 padding, no shadow at rest.
 * With `onPress` it is a button that tints and lifts while pressed; `selected` draws a 2 px brand
 * border (current cooperative, chosen option). The padding shrinks by 1 when selected, so the
 * content does not move.
 */
export function Card({
  children,
  onPress,
  selected = false,
  style,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const frame = [
    styles.card,
    {
      backgroundColor: colors.surface,
      borderColor: selected ? colors.primary : colors.outlineVariant,
      borderWidth: selected ? 2 : 1,
      padding: selected ? space[4] - 1 : space[4],
    },
    style,
  ];
  if (!onPress) {
    return (
      <View style={frame} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }
  return (
    <PressableBox
      style={frame}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      testID={testID}
    >
      {children}
    </PressableBox>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md },
});
