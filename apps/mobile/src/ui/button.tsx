import { Button as PaperButton, useTheme } from 'react-native-paper';

import { useBrandColor } from '../branding/brand';

/**
 * Variants map to Paper modes: `primary` is a filled (contained) button in the brand colour,
 * `secondary` an outlined one, `danger` a filled one in the error colour.
 */
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
  const theme = useTheme();
  const brand = useBrandColor();
  const accent = color ?? brand;
  const inactive = disabled || loading;
  return (
    <PaperButton
      mode={variant === 'secondary' ? 'outlined' : 'contained'}
      buttonColor={
        variant === 'danger' ? theme.colors.error : variant === 'primary' ? accent : undefined
      }
      textColor={variant === 'secondary' ? accent : '#fff'}
      style={variant === 'secondary' ? { borderColor: accent } : undefined}
      contentStyle={{ minHeight: 48 }}
      loading={loading}
      // Loading keeps the colours of an enabled button; it only ignores presses.
      disabled={disabled}
      onPress={inactive ? undefined : onPress}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
    >
      {title}
    </PaperButton>
  );
}
