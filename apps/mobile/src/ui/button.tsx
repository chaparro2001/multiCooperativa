import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useBrandColor } from '../branding/brand';
import { colors } from './theme';

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  color,
  testID,
}: {
  title: string;
  onPress(): void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Overrides the cooperative's brand colour (the appearance preview). */
  color?: string;
  testID?: string;
}) {
  const brand = useBrandColor();
  const accent = color ?? brand;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        variant === 'primary' && { backgroundColor: accent },
        variant === 'secondary' && { borderColor: accent },
        (pressed || inactive) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? accent : '#fff'} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'secondary' && styles.secondaryText,
            variant === 'secondary' && { color: accent },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  dimmed: { opacity: 0.6 },
  text: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryText: { color: colors.primary },
});
