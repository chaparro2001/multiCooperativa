import { Pressable, StyleSheet, View } from 'react-native';
import { Switch, Text, useTheme } from 'react-native-paper';

import { size, space } from './theme';

/**
 * Labelled switch row: label and optional `muted` help line on the left, Paper `Switch` on the
 * right; the whole row toggles (48 high). The help line should say what "off" means. The
 * `testID` sits on the row, the pressable element.
 */
export function SwitchRow({
  label,
  help,
  value,
  onValueChange,
  disabled = false,
  testID,
}: {
  label: string;
  help?: string;
  value: boolean;
  onValueChange(value: boolean): void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={styles.row}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={help}
      accessibilityState={{ checked: value, disabled }}
      testID={testID}
    >
      <View style={styles.text}>
        <Text variant="bodyLarge">{label}</Text>
        {help ? (
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
            {help}
          </Text>
        ) : null}
      </View>
      {/* Presentational: the row is the control. */}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Switch value={value} disabled={disabled} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: size.control },
  text: { flex: 1, gap: 2 },
});
