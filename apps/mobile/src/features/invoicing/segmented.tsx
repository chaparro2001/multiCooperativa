import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useBrandColor } from '@/branding/brand';
import { FieldGroup } from '@/ui/field';
import { colors } from '@/ui/theme';

/** Two or three exclusive choices as a pill row. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  testIDPrefix,
  name,
  error,
}: {
  value: T;
  onChange(value: T): void;
  options: { value: T; label: string }[];
  testIDPrefix: string;
  /** Links the choice to the surrounding form's validation state (required selectors). */
  name?: string;
  error?: string;
}) {
  const row = (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[styles.option, value === option.value && styles.selected]}
          testID={`${testIDPrefix}-${option.value}`}
        >
          <Text style={[styles.text, value === option.value && styles.selectedText]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return name || error ? (
    <FieldGroup name={name} error={error}>
      {row}
    </FieldGroup>
  ) : (
    row
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3 },
  option: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  selected: { backgroundColor: '#fff' },
  text: { color: colors.muted, fontWeight: '500' },
  selectedText: { color: colors.text },
});

/** Toggle pill for multi-select choices (roles, delivery notes to group). */
export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  testID?: string;
}) {
  const brand = useBrandColor();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        chipStyles.chip,
        selected && chipStyles.chipSelected,
        selected && { backgroundColor: brand, borderColor: brand },
      ]}
      testID={testID}
    >
      <Text style={[chipStyles.text, selected && chipStyles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.text },
  textSelected: { color: '#fff', fontWeight: '600' },
});
