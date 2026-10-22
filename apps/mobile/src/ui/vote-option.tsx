import { StyleSheet } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { PressableBox } from './pressable-box';
import { radius, space } from './theme';

/**
 * One of the three large radio cards of the vote screen (64 high). Selected: 2 px brand border,
 * tinted fill and a filled radio, so it is not colour alone. Keep the `option-<value>` testID.
 */
export function VoteOption({
  label,
  selected,
  disabled = false,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress(): void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableBox
      style={[
        styles.option,
        {
          borderColor: selected ? colors.primary : colors.outlineVariant,
          backgroundColor: selected ? colors.primaryContainer : colors.surface,
        },
      ]}
      pressedColor={selected ? colors.primaryContainer : undefined}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      testID={testID}
    >
      <Icon
        source={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={24}
        color={selected ? colors.primary : colors.onSurfaceVariant}
      />
      <Text variant="titleMedium" style={styles.label}>
        {label}
      </Text>
    </PressableBox>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 2,
  },
  label: { fontSize: 18 },
});
