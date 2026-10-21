import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useBrandColor } from '@/branding/brand';

import { colors } from './theme';

/** A labelled box that is checked or not (role "checkbox"). */
export function Checkbox({
  label,
  checked,
  onChange,
  testID,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  testID?: string;
}) {
  const brand = useBrandColor();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
      testID={testID}
    >
      <View style={[styles.box, checked && { backgroundColor: brand, borderColor: brand }]}>
        {checked && <Text style={styles.tick}>✓</Text>}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  tick: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label: { flex: 1, fontSize: 15, color: colors.text },
});
